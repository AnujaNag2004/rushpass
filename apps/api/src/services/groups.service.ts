import crypto from 'node:crypto';
import type { ActivityItem, ChatMessage, GroupStateDTO } from '@rushpass/shared';
import { GROUP_EXTEND_MS, MAX_GROUP_MEMBERS, MEMBER_COLORS, SOCKET, seatLabel } from '@rushpass/shared';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { extendSeatsAtomic } from '../lib/locks.js';
import { prisma } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { emitTo, rooms } from '../lib/socket.js';
import { scheduleGroupExpiry } from '../jobs/scheduler.js';
import {
  deleteHold,
  findGroupHold,
  holdSeatMap,
  lockSeats,
  readHold,
  releaseInternal,
  releaseSeats as releaseHoldSeats,
  setHoldExpiry,
} from './holds.service.js';
import { venueSeats } from './seatState.service.js';
import { toShowDTO } from './dto.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_META_TTL_SEC = 2 * 24 * 60 * 60;

function genCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function loadRoom(code: string) {
  const room = await prisma.groupRoom.findUnique({
    where: { code: code.toUpperCase() },
    include: { members: { include: { user: true }, orderBy: { joinedAt: 'asc' } } },
  });
  if (!room) throw notFound('Group room');
  return room;
}

type Room = Awaited<ReturnType<typeof loadRoom>>;

function assertMember(room: Room, userId: string) {
  const member = room.members.find((m) => m.userId === userId);
  if (!member) throw forbidden('Join this group first');
  return member;
}

function assertHost(room: Room, userId: string) {
  if (room.hostId !== userId) throw forbidden('Only the host can do that');
}

/* ---------------------------- activity + chat ---------------------------- */

export async function addActivity(code: string, text: string, color?: string) {
  const item: ActivityItem = { id: crypto.randomUUID(), text, color, at: Date.now() };
  const key = keys.activity(code);
  await redis.multi().lpush(key, JSON.stringify(item)).ltrim(key, 0, 49).expire(key, ROOM_META_TTL_SEC).exec();
  emitTo(rooms.group(code), SOCKET.GROUP_ACTIVITY, item);
  return item;
}

async function readList<T>(key: string, max: number): Promise<T[]> {
  const raw = await redis.lrange(key, 0, max - 1);
  return raw.map((r) => JSON.parse(r) as T);
}

export async function postChat(code: string, userId: string, text: string) {
  const room = await loadRoom(code);
  const member = assertMember(room, userId);
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    userId,
    name: member.user.name,
    color: member.color,
    text: text.slice(0, 500),
    at: Date.now(),
    reactions: {},
  };
  const key = keys.chat(room.code);
  await redis.multi().rpush(key, JSON.stringify(msg)).ltrim(key, -100, -1).expire(key, ROOM_META_TTL_SEC).exec();
  emitTo(rooms.group(room.code), SOCKET.GROUP_CHAT, msg);
  return msg;
}

export async function reactToChat(code: string, userId: string, messageId: string, emoji: string) {
  const room = await loadRoom(code);
  assertMember(room, userId);
  const key = keys.chat(room.code);
  const raw = await redis.lrange(key, 0, -1);
  const index = raw.findIndex((r) => (JSON.parse(r) as ChatMessage).id === messageId);
  if (index < 0) return null;
  const msg = JSON.parse(raw[index]) as ChatMessage;
  const users = new Set(msg.reactions[emoji] ?? []);
  if (users.has(userId)) users.delete(userId);
  else users.add(userId);
  msg.reactions[emoji] = [...users];
  if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
  await redis.lset(key, index, JSON.stringify(msg));
  emitTo(rooms.group(room.code), SOCKET.GROUP_REACT, { messageId, reactions: msg.reactions });
  return msg;
}

/* -------------------------------- presence ------------------------------- */

export async function presenceChange(code: string, userId: string, delta: 1 | -1) {
  const key = keys.presence(code);
  const count = await redis.hincrby(key, userId, delta);
  if (count <= 0) await redis.hdel(key, userId);
  await redis.expire(key, ROOM_META_TTL_SEC);
  if ((delta === 1 && count === 1) || (delta === -1 && count <= 0)) {
    emitTo(rooms.group(code), SOCKET.GROUP_PRESENCE, { userId, online: delta === 1 });
  }
}

/* --------------------------------- state --------------------------------- */

export async function getState(code: string): Promise<GroupStateDTO> {
  const room = await loadRoom(code);
  const show = await prisma.show.findUnique({
    where: { id: room.showId },
    include: { venue: { include: { _count: { select: { seats: true } } } }, event: true },
  });
  if (!show) throw notFound('Show');

  const hold = await findGroupHold(room.code);
  const held = hold ? await holdSeatMap(hold.id) : {};
  const booked = await prisma.bookingSeat.findMany({
    where: { booking: { groupRoomId: room.id, status: 'CONFIRMED' } },
    select: { seatId: true, booking: { select: { userId: true } } },
  });
  const presence = await redis.hgetall(keys.presence(room.code));
  const seatsByUser = new Map<string, string[]>();
  for (const [seatId, uid] of Object.entries(held)) seatsByUser.set(uid, [...(seatsByUser.get(uid) ?? []), seatId]);
  for (const b of booked) seatsByUser.set(b.booking.userId, [...(seatsByUser.get(b.booking.userId) ?? []), b.seatId]);

  const [chat, activity] = await Promise.all([
    readList<ChatMessage>(keys.chat(room.code), 100),
    readList<ActivityItem>(keys.activity(room.code), 30),
  ]);

  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    holdId: hold?.id ?? null,
    expiresAt: room.expiresAt?.getTime() ?? null,
    extended: room.extended,
    show: {
      ...toShowDTO(show),
      event: { id: show.event.id, title: show.event.title, slug: show.event.slug, bannerUrl: show.event.bannerUrl },
    },
    members: room.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      color: m.color,
      online: Number(presence[m.userId] ?? 0) > 0,
      isHost: m.userId === room.hostId,
      paymentStatus: m.paymentStatus,
      seatIds: seatsByUser.get(m.userId) ?? [],
    })),
    chat,
    activity,
  };
}

export async function broadcastState(code: string) {
  const state = await getState(code);
  emitTo(rooms.group(code), SOCKET.GROUP_STATE, state);
  return state;
}

/* ------------------------------- lifecycle ------------------------------- */

export async function createRoom(showId: string, hostId: string) {
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show) throw notFound('Show');
  if (show.startsAt.getTime() < Date.now()) throw badRequest('This show has already started');
  if (show.isDrop) throw badRequest('Group rooms are not available for drops — join the waiting room instead');
  const host = await prisma.user.findUniqueOrThrow({ where: { id: hostId } });

  let code = genCode();
  for (let i = 0; i < 5 && (await prisma.groupRoom.findUnique({ where: { code } })); i++) code = genCode();

  await prisma.groupRoom.create({
    data: { code, showId, hostId, members: { create: { userId: hostId, color: host.avatarColor || MEMBER_COLORS[0] } } },
  });
  await addActivity(code, `${host.name} created the room`, host.avatarColor);
  return getState(code);
}

export async function joinRoom(code: string, userId: string) {
  const room = await loadRoom(code);
  if (room.members.some((m) => m.userId === userId)) return getState(room.code);
  if (room.status !== 'OPEN') throw badRequest('This room is no longer accepting members');
  if (room.members.length >= MAX_GROUP_MEMBERS) throw badRequest(`Rooms are limited to ${MAX_GROUP_MEMBERS} people`);

  const used = new Set(room.members.map((m) => m.color));
  const color = MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[room.members.length % MEMBER_COLORS.length];
  const member = await prisma.groupMember.create({ data: { roomId: room.id, userId, color }, include: { user: true } });
  await addActivity(room.code, `${member.user.name} joined`, color);
  return broadcastState(room.code);
}

export async function selectSeats(code: string, userId: string, seatIds: string[]) {
  const room = await loadRoom(code);
  const member = assertMember(room, userId);
  if (room.status !== 'OPEN') throw badRequest('Seats are locked in — no more changes');

  const { hold, created } = await lockSeats({
    showId: room.showId,
    userId,
    seatIds,
    groupCode: room.code,
    groupHostId: room.hostId,
  });
  if (created) {
    await prisma.groupRoom.update({ where: { id: room.id }, data: { expiresAt: new Date(hold.expiresAt) } });
    await scheduleGroupExpiry(room.code, hold.expiresAt);
  }
  const picked = hold.seats.filter((s) => seatIds.includes(s.id));
  emitTo(rooms.group(room.code), SOCKET.GROUP_SEAT_SELECT, { userId, seatIds });
  await addActivity(room.code, `${member.user.name} picked ${picked.map(seatLabel).join(', ')}`, member.color);
  await broadcastState(room.code);
  return hold;
}

export async function releaseSeats(code: string, userId: string, seatIds: string[]) {
  const room = await loadRoom(code);
  const member = assertMember(room, userId);
  if (room.status !== 'OPEN') throw badRequest('Seats are locked in — no more changes');
  const hold = await findGroupHold(room.code);
  if (!hold) return [];
  const released = await releaseHoldSeats(hold.id, userId, seatIds);
  if (released.length) {
    const seats = (await venueSeats((await prisma.show.findUniqueOrThrow({ where: { id: room.showId } })).venueId))
      .filter((s) => released.includes(s.id));
    emitTo(rooms.group(room.code), SOCKET.GROUP_SEAT_RELEASE, { userId, seatIds: released });
    await addActivity(room.code, `${member.user.name} dropped ${seats.map(seatLabel).join(', ')}`, member.color);
    await broadcastState(room.code);
  }
  return released;
}

export async function lockIn(code: string, userId: string) {
  const room = await loadRoom(code);
  assertHost(room, userId);
  if (room.status !== 'OPEN') throw badRequest('Already locked in');
  const hold = await findGroupHold(room.code);
  const map = hold ? await holdSeatMap(hold.id) : {};
  if (!Object.keys(map).length) throw badRequest('Pick at least one seat before locking in');

  const withSeats = new Set(Object.values(map));
  await prisma.$transaction([
    prisma.groupRoom.update({ where: { id: room.id }, data: { status: 'PAYING' } }),
    prisma.groupMember.updateMany({
      where: { roomId: room.id, userId: { in: [...withSeats] } },
      data: { paymentStatus: 'PENDING' },
    }),
  ]);
  emitTo(rooms.group(room.code), SOCKET.GROUP_LOCKIN, { code: room.code });
  await addActivity(room.code, '🔒 Seats locked in — everyone pay your share!');
  return broadcastState(room.code);
}

export async function extend(code: string, userId: string) {
  const room = await loadRoom(code);
  assertHost(room, userId);
  if (room.extended) throw badRequest('The timer can only be extended once');
  if (!['OPEN', 'PAYING'].includes(room.status) || !room.expiresAt) throw badRequest('Nothing to extend yet');
  const hold = await findGroupHold(room.code);
  if (!hold) throw badRequest('The hold has already expired');

  const newExpiry = room.expiresAt.getTime() + GROUP_EXTEND_MS;
  const map = await holdSeatMap(hold.id);
  await extendSeatsAtomic(room.showId, Object.keys(map), hold.id, newExpiry - Date.now());
  await setHoldExpiry(hold, newExpiry);
  await prisma.groupRoom.update({ where: { id: room.id }, data: { extended: true, expiresAt: new Date(newExpiry) } });
  await scheduleGroupExpiry(room.code, newExpiry);
  await addActivity(room.code, '⏱️ Host added 2 more minutes');
  return broadcastState(room.code);
}

export async function kick(code: string, hostId: string, userId: string) {
  const room = await loadRoom(code);
  assertHost(room, hostId);
  if (userId === hostId) throw badRequest('The host cannot be removed');
  const member = room.members.find((m) => m.userId === userId);
  if (!member) throw notFound('Member');
  if (member.paymentStatus === 'PAID') throw conflict('ALREADY_PAID', 'This member has already paid');

  const hold = await findGroupHold(room.code);
  if (hold) {
    const map = await holdSeatMap(hold.id);
    await releaseInternal(
      hold,
      Object.keys(map).filter((sid) => map[sid] === userId),
    );
  }
  await prisma.booking.updateMany({
    where: { groupRoomId: room.id, userId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
  await prisma.groupMember.delete({ where: { id: member.id } });
  emitTo(rooms.user(userId), SOCKET.GROUP_KICKED, { code: room.code });
  await addActivity(room.code, `${member.user.name} was removed by the host`);
  return broadcastState(room.code);
}

export async function cancelRoom(code: string, hostId: string) {
  const room = await loadRoom(code);
  assertHost(room, hostId);
  if (room.members.some((m) => m.paymentStatus === 'PAID')) {
    throw conflict('ALREADY_PAID', 'Someone has already paid — the room cannot be cancelled now');
  }
  const hold = await findGroupHold(room.code);
  if (hold) {
    await releaseInternal(hold, Object.keys(await holdSeatMap(hold.id)));
    await deleteHold(hold);
  }
  await prisma.booking.updateMany({ where: { groupRoomId: room.id, status: 'PENDING' }, data: { status: 'FAILED' } });
  await prisma.groupRoom.update({ where: { id: room.id }, data: { status: 'CANCELLED' } });
  await addActivity(room.code, '❌ The host cancelled this room');
  return broadcastState(room.code);
}

/** Payment hook: called by checkout after a member's booking is confirmed. */
export async function onMemberPaid(groupRoomId: string, userId: string) {
  const room = await prisma.groupRoom.findUnique({ where: { id: groupRoomId } });
  if (!room) return;
  const member = await prisma.groupMember.update({
    where: { roomId_userId: { roomId: room.id, userId } },
    data: { paymentStatus: 'PAID' },
    include: { user: true },
  });
  emitTo(rooms.group(room.code), SOCKET.GROUP_PAYMENT_UPDATE, { userId, paymentStatus: 'PAID' });
  await addActivity(room.code, `✅ ${member.user.name} paid`, member.color);

  const pending = await prisma.groupMember.count({ where: { roomId: room.id, paymentStatus: 'PENDING' } });
  if (pending === 0) {
    await prisma.groupRoom.update({ where: { id: room.id }, data: { status: 'COMPLETED' } });
    const hold = await findGroupHold(room.code);
    if (hold) await deleteHold(hold);
    await addActivity(room.code, "🎉 Everyone's in! Tickets are in your bookings.");
  }
  await broadcastState(room.code);
}

export async function onMemberPaymentFailed(groupRoomId: string, userId: string) {
  const room = await prisma.groupRoom.findUnique({ where: { id: groupRoomId } });
  if (!room) return;
  emitTo(rooms.group(room.code), SOCKET.GROUP_PAYMENT_UPDATE, { userId, paymentStatus: 'PENDING', failed: true });
  const member = await prisma.groupMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
    include: { user: true },
  });
  if (member) await addActivity(room.code, `⚠️ ${member.user.name}'s payment failed — they can retry`, member.color);
}

/**
 * Timer ran out. Paid members keep their tickets (partial success);
 * unpaid members' seats go back on sale.
 */
export async function expireRoom(code: string, expectedExpiresAt?: number) {
  const room = await loadRoom(code);
  if (!['OPEN', 'PAYING'].includes(room.status)) return;
  if (expectedExpiresAt && room.expiresAt && room.expiresAt.getTime() !== expectedExpiresAt) return; // extended
  if (room.expiresAt && room.expiresAt.getTime() > Date.now() + 500) return;

  const hold = await findGroupHold(room.code) ?? (await readHoldFromPointer(room.code));
  const map = hold ? await holdSeatMap(hold.id) : {};
  const paid = new Set(room.members.filter((m) => m.paymentStatus === 'PAID').map((m) => m.userId));
  const releasable = Object.keys(map).filter((sid) => !paid.has(map[sid]));
  if (hold) {
    await releaseInternal(hold, releasable);
    await deleteHold(hold);
  }
  const unpaidIds = room.members.filter((m) => !paid.has(m.userId)).map((m) => m.userId);
  await prisma.$transaction([
    prisma.groupMember.updateMany({
      where: { roomId: room.id, userId: { in: unpaidIds }, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'FAILED' },
    }),
    prisma.booking.updateMany({ where: { groupRoomId: room.id, status: 'PENDING' }, data: { status: 'FAILED' } }),
    prisma.groupRoom.update({ where: { id: room.id }, data: { status: paid.size ? 'COMPLETED' : 'EXPIRED' } }),
  ]);

  emitTo(rooms.group(room.code), SOCKET.GROUP_EXPIRED, {
    code: room.code,
    paidCount: paid.size,
    releasedSeats: releasable.length,
  });
  await addActivity(
    room.code,
    paid.size
      ? `⌛ Time's up. ${paid.size} member(s) got tickets; ${releasable.length} unpaid seat(s) were released.`
      : "⌛ Time's up. All seats were released.",
  );
  await broadcastState(room.code);
}

async function readHoldFromPointer(code: string) {
  const id = await redis.get(keys.groupHold(code));
  return id ? readHold(id) : null;
}
