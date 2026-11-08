import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Crown,
  Lock,
  LogIn,
  MessageCircle,
  PartyPopper,
  Share2,
  Timer,
  Trash2,
  UserMinus,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { ActivityItem, ChatMessage, CheckoutOrderDTO, GroupStateDTO, HoldDTO, SeatDTO, SeatState } from '@rushpass/shared';
import { GROUP_EXTEND_MS, GROUP_HOLD_MS, SOCKET, priceBreakdown, seatLabel, tierPrice } from '@rushpass/shared';
import { Avatar, AvatarStack, GradientMesh, PresenceDot } from '../components/Brand';
import { Banner, CountdownTimer } from '../components/Booking';
import { ActivityFeed, ChatPanel, PaymentStatusBoard } from '../components/Live';
import { SeatLegend, SeatMap } from '../components/SeatMap';
import { Button } from '../components/ui/Button';
import { Badge, Card, EmptyState, Modal, PageLoader, Tabs } from '../components/ui';
import { useShowSeats } from '../hooks/useShowSeats';
import { useSocketEvent, useSocketRoom } from '../hooks/useSocket';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { cn, formatDateTime, rupees } from '../lib/format';
import { useAuth } from '../store/auth';

export default function GroupRoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode!.toUpperCase();
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['group', code];

  const { data: room, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<GroupStateDTO>(`/groups/${code}`) });
  const isMember = !!room?.members.some((m) => m.userId === user.id);

  const update = useCallback((fn: (r: GroupStateDTO) => GroupStateDTO) => qc.setQueryData<GroupStateDTO>(key, (prev) => (prev ? fn(prev) : prev)), [qc, code]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ realtime ------------------------------ */
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  useSocketRoom(SOCKET.GROUP_JOIN, SOCKET.GROUP_LEAVE, code, isMember);
  useSocketEvent<GroupStateDTO>(SOCKET.GROUP_STATE, (s) => s.code === code && qc.setQueryData(key, s), isMember);
  useSocketEvent<ChatMessage>(SOCKET.GROUP_CHAT, (m) => update((r) => (r.chat.some((c) => c.id === m.id) ? r : { ...r, chat: [...r.chat, m] })), isMember);
  useSocketEvent<{ messageId: string; reactions: ChatMessage['reactions'] }>(
    SOCKET.GROUP_REACT,
    (p) => update((r) => ({ ...r, chat: r.chat.map((c) => (c.id === p.messageId ? { ...c, reactions: p.reactions } : c)) })),
    isMember,
  );
  useSocketEvent<ActivityItem>(SOCKET.GROUP_ACTIVITY, (a) => update((r) => (r.activity.some((x) => x.id === a.id) ? r : { ...r, activity: [a, ...r.activity] })), isMember);
  useSocketEvent<{ userId: string; online: boolean }>(
    SOCKET.GROUP_PRESENCE,
    (p) => update((r) => ({ ...r, members: r.members.map((m) => (m.userId === p.userId ? { ...m, online: p.online } : m)) })),
    isMember,
  );
  useSocketEvent<{ userId: string; seatId: string | null }>(SOCKET.GROUP_CURSOR, (p) => setCursors((c) => ({ ...c, [p.userId]: p.seatId })), isMember);
  useSocketEvent<{ paidCount: number; releasedSeats: number }>(
    SOCKET.GROUP_EXPIRED,
    (p) => toast.warning(p.paidCount ? `Time's up — ${p.releasedSeats} unpaid seat(s) were released.` : "Time's up — all seats were released."),
    isMember,
  );
  useSocketEvent<{ code: string }>(SOCKET.GROUP_KICKED, (p) => {
    if (p.code !== code) return;
    toast.error('The host removed you from this room.');
    navigate('/');
  });

  const seatsQuery = useShowSeats(room?.show.id);

  if (isLoading) return <PageLoader />;
  if (error || !room) return <EmptyState title="Room not found" body={errorMessage(error)} action={<Link to="/explore"><Button variant="outline">Explore events</Button></Link>} />;
  if (!isMember) return <JoinScreen room={room} onJoined={(s) => qc.setQueryData(key, s)} />;

  return <RoomView room={room} cursors={cursors} seats={seatsQuery.data?.seats ?? []} states={seatsQuery.data?.states ?? {}} />;
}

/* ------------------------------------------------------------------------ */

function JoinScreen({ room, onJoined }: { room: GroupStateDTO; onJoined: (s: GroupStateDTO) => void }) {
  const [joining, setJoining] = useState(false);
  const host = room.members.find((m) => m.isHost);
  const join = async () => {
    setJoining(true);
    try {
      onJoined(await api.post<GroupStateDTO>(`/groups/${room.code}/join`));
      toast.success('You joined the room!');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setJoining(false);
    }
  };
  return (
    <div className="relative isolate overflow-hidden">
      <GradientMesh intense />
      <div className="container-page flex max-w-xl flex-col items-center py-16 text-center">
        <Badge tone="primary">
          <Users className="h-3 w-3" /> Group room invite
        </Badge>
        <h1 className="mt-4 text-4xl font-bold">
          {host?.name.split(' ')[0]} wants you at <span className="text-gradient">{room.show.event.title}</span>
        </h1>
        <p className="mt-3 text-muted">
          {formatDateTime(room.show.startsAt)} · {room.show.venue.name}
        </p>
        <div className="card mt-8 w-full overflow-hidden">
          <Banner src={room.show.event.bannerUrl} alt="" className="h-40 w-full" />
          <div className="p-6">
            <div className="flex items-center justify-between">
              <AvatarStack people={room.members.map((m) => ({ name: m.name, color: m.color, online: m.online }))} />
              <span className="font-mono text-2xl font-bold tracking-[0.25em]">{room.code}</span>
            </div>
            <p className="mt-4 text-left text-sm text-muted">
              Pick your own seat on the live map, then pay just your share. {room.members.length} of 8 spots taken.
            </p>
            <Button variant="gradient" size="lg" className="mt-6 w-full" onClick={join} loading={joining} disabled={room.status !== 'OPEN'} icon={<LogIn className="h-4 w-4" />}>
              {room.status === 'OPEN' ? 'Join the room' : 'This room is closed'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type Panel = 'crew' | 'chat' | 'activity';

function RoomView({
  room,
  cursors,
  seats,
  states,
}: {
  room: GroupStateDTO;
  cursors: Record<string, string | null>;
  seats: SeatDTO[];
  states: Record<string, SeatState>;
}) {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>('crew');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const lastCursor = useRef<string | null>(null);

  const me = room.members.find((m) => m.userId === user.id)!;
  const isHost = room.hostId === user.id;
  const memberColors = useMemo(() => Object.fromEntries(room.members.map((m) => [m.userId, m.color])), [room.members]);
  const memberNames = useMemo(() => Object.fromEntries(room.members.map((m) => [m.userId, m.name])), [room.members]);
  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const shares = useMemo(
    () =>
      Object.fromEntries(
        room.members.map((m) => {
          const subtotal = m.seatIds.reduce((sum, id) => {
            const s = seatById.get(id);
            return sum + (s ? tierPrice(room.show, s.tier) : 0);
          }, 0);
          return [m.userId, priceBreakdown(subtotal).total];
        }),
      ),
    [room.members, room.show, seatById],
  );
  const totalSeats = room.members.reduce((n, m) => n + m.seatIds.length, 0);
  const open = room.status === 'OPEN';
  const paying = room.status === 'PAYING';
  const closed = !open && !paying;

  const toggle = async (seat: SeatDTO, state: SeatState | undefined) => {
    if (!open || pending.has(seat.id)) return;
    const mine = state?.status === 'HELD' && state.userId === user.id;
    setPending((p) => new Set(p).add(seat.id));
    try {
      if (mine && room.holdId) await api.post(`/holds/${room.holdId}/release`, { seatIds: [seat.id] });
      else await api.post<HoldDTO>(`/shows/${room.show.id}/holds`, { seatIds: [seat.id], groupCode: room.code });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(seat.id);
        return n;
      });
    }
  };

  const hover = (seatId: string | null) => {
    if (seatId === lastCursor.current) return;
    lastCursor.current = seatId;
    getSocket().emit(SOCKET.GROUP_CURSOR, { code: room.code, seatId });
  };

  const act = async (name: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(name);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const payShare = () =>
    act('pay', async () => {
      const order = await api.post<CheckoutOrderDTO>('/checkout/orders', { groupCode: room.code }, { 'Idempotency-Key': crypto.randomUUID() });
      navigate(`/checkout/${order.bookingId}`);
    });

  const copyLink = async () => {
    const url = `${window.location.origin}/group/${room.code}`;
    if (navigator.share && /Mobi/i.test(navigator.userAgent)) {
      await navigator.share({ title: `Join me at ${room.show.event.title}`, text: `Room ${room.code}`, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied!');
    }
  };

  return (
    <div className="container-page py-6">
      {/* Header */}
      <Card className="relative overflow-hidden p-0">
        <div className="absolute inset-0 -z-0 opacity-30">
          <Banner src={room.show.event.bannerUrl} alt="" className="h-full w-full blur-sm" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/60" />
        <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">
                <Users className="h-3 w-3" /> Group room
              </Badge>
              <StatusBadge status={room.status} />
            </div>
            <h1 className="mt-2 truncate text-2xl font-bold md:text-3xl">{room.show.event.title}</h1>
            <p className="text-sm text-muted">
              {formatDateTime(room.show.startsAt)} · {room.show.venue.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={copyLink} className="group rounded-2xl border border-dashed border-primary/50 bg-primary/10 px-4 py-2 text-left transition hover:bg-primary/20" aria-label="Copy invite link">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
                Invite code {'share' in navigator ? <Share2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </div>
              <div className="font-mono text-2xl font-bold tracking-[0.25em]">{room.code}</div>
            </button>
            <AvatarStack people={room.members.map((m) => ({ name: m.name, color: m.color, online: m.online }))} max={6} />
            {room.expiresAt && !closed ? (
              <CountdownTimer expiresAt={room.expiresAt} total={GROUP_HOLD_MS + (room.extended ? GROUP_EXTEND_MS : 0)} label="Group timer" />
            ) : (
              open && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Timer className="h-4 w-4" /> 7-min timer starts with the first pick
                </div>
              )
            )}
          </div>
        </div>
      </Card>

      {/* Stage banner */}
      <AnimatePresence mode="wait">
        <motion.div key={room.status} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          {open && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/50 p-4 sm:flex-row sm:items-center">
              <Zap className="h-5 w-5 shrink-0 text-gold" />
              <p className="flex-1 text-sm">
                <b>Everyone picks their own seat.</b> <span className="text-muted">Seats in your colour are yours. When the crew is ready, the host locks in and everyone pays their share.</span>
              </p>
              {isHost && (
                <div className="flex gap-2">
                  {room.expiresAt && !room.extended && (
                    <Button variant="outline" size="sm" loading={busy === 'extend'} onClick={() => act('extend', () => api.post(`/groups/${room.code}/extend`), '+2 minutes added')}>
                      +2 min
                    </Button>
                  )}
                  <Button variant="gradient" size="sm" disabled={!totalSeats} loading={busy === 'lockin'} onClick={() => act('lockin', () => api.post(`/groups/${room.code}/lockin`), 'Seats locked in!')} icon={<Lock className="h-4 w-4" />}>
                    Lock in {totalSeats ? `${totalSeats} seats` : ''}
                  </Button>
                </div>
              )}
            </div>
          )}
          {paying && (
            <div className="grid gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4 text-primary" /> Seats locked — time to pay your share
                </div>
                <p className="text-sm text-muted">Paid friends keep their tickets even if someone else runs out of time.</p>
              </div>
              {me.paymentStatus === 'PAID' ? (
                <span className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="h-5 w-5" /> You’ve paid
                </span>
              ) : me.seatIds.length ? (
                <Button variant="gradient" size="lg" loading={busy === 'pay'} onClick={payShare}>
                  Pay my share · {rupees(shares[user.id])} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <span className="text-sm text-muted">You didn’t pick a seat this time.</span>
              )}
            </div>
          )}
          {closed && (
            <div className={cn('flex items-center gap-3 rounded-2xl border p-4', room.status === 'COMPLETED' ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10')}>
              {room.status === 'COMPLETED' ? <PartyPopper className="h-5 w-5 text-success" /> : <Timer className="h-5 w-5 text-danger" />}
              <p className="flex-1 text-sm">
                {room.status === 'COMPLETED'
                  ? 'This room is done — tickets are in each member’s “My tickets”.'
                  : room.status === 'CANCELLED'
                    ? 'The host cancelled this room.'
                    : 'Time ran out and the seats went back on sale.'}
              </p>
              <Link to={room.status === 'COMPLETED' ? '/bookings' : `/events/${room.show.event.slug}`}>
                <Button variant="outline" size="sm">{room.status === 'COMPLETED' ? 'My tickets' : 'Back to event'}</Button>
              </Link>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="min-w-0 p-3 sm:p-5">
          {seats.length ? (
            <SeatMap
              seats={seats}
              states={states}
              myUserId={user.id}
              groupCode={room.code}
              memberColors={memberColors}
              cursors={cursors}
              cursorNames={memberNames}
              pending={pending}
              readOnly={!open}
              prices={{ REGULAR: room.show.priceRegular, PREMIUM: room.show.pricePremium, VIP: room.show.priceVip }}
              onSeatClick={toggle}
              onSeatHover={hover}
            />
          ) : (
            <PageLoader />
          )}
          <SeatLegend group className="mt-4 border-t border-border pt-4" />
        </Card>

        <div className="space-y-4">
          {paying && (
            <Card className="p-5">
              <PaymentStatusBoard members={room.members} shares={shares} />
            </Card>
          )}
          <Card className="flex h-[560px] flex-col p-4">
            <Tabs
              className="w-full [&>button]:flex-1"
              value={panel}
              onChange={setPanel}
              tabs={[
                { value: 'crew', label: 'Crew', count: room.members.length },
                { value: 'chat', label: 'Chat', count: room.chat.length || undefined },
                { value: 'activity', label: 'Live' },
              ]}
            />
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {panel === 'crew' && (
                <ul className="space-y-2">
                  {room.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
                      <div className="relative">
                        <Avatar name={m.name} color={m.color} size={36} />
                        <PresenceDot online={m.online} className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {m.userId === user.id ? 'You' : m.name}
                          {m.isHost && <Crown className="h-3.5 w-3.5 text-gold" aria-label="host" />}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {m.seatIds.length ? (
                            m.seatIds.map((id) => {
                              const s = seatById.get(id);
                              return (
                                <span key={id} className="rounded px-1.5 font-mono text-[11px] font-bold text-[#0B0A14]" style={{ background: m.color }}>
                                  {s ? seatLabel(s) : '…'}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-muted">No seat yet</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {!!m.seatIds.length && <div className="font-mono text-xs">{rupees(shares[m.userId])}</div>}
                        {m.paymentStatus === 'PAID' && <Badge tone="success">Paid</Badge>}
                        {m.paymentStatus === 'PENDING' && <Badge tone="gold">Pending</Badge>}
                        {m.paymentStatus === 'FAILED' && <Badge tone="danger">Missed</Badge>}
                      </div>
                      {isHost && !m.isHost && m.paymentStatus !== 'PAID' && !closed && (
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                          aria-label={`Remove ${m.name}`}
                          onClick={() => act(`kick-${m.userId}`, () => api.del(`/groups/${room.code}/members/${m.userId}`), `${m.name} removed`)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                  {room.members.length < 8 && open && (
                    <li>
                      <button onClick={copyLink} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted hover:border-primary/50 hover:text-text">
                        <Share2 className="h-4 w-4" /> Invite more friends ({8 - room.members.length} spots left)
                      </button>
                    </li>
                  )}
                </ul>
              )}
              {panel === 'chat' && (
                <ChatPanel
                  className="h-full"
                  messages={room.chat}
                  myUserId={user.id}
                  onSend={(text) => getSocket().emit(SOCKET.GROUP_CHAT, { code: room.code, text })}
                  onReact={(messageId, emoji) => getSocket().emit(SOCKET.GROUP_REACT, { code: room.code, messageId, emoji })}
                />
              )}
              {panel === 'activity' && <ActivityFeed items={room.activity} />}
            </div>
            {panel !== 'chat' && room.chat.length > 0 && (
              <button onClick={() => setPanel('chat')} className="mt-3 flex items-center gap-2 truncate rounded-xl bg-surface-2/60 px-3 py-2 text-left text-xs text-muted hover:text-text">
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                <b className="text-text">{room.chat[room.chat.length - 1].name.split(' ')[0]}:</b> {room.chat[room.chat.length - 1].text}
              </button>
            )}
          </Card>
          {isHost && !closed && (
            <button onClick={() => setConfirmCancel(true)} className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm text-muted hover:text-danger">
              <Trash2 className="h-4 w-4" /> Cancel room
            </button>
          )}
        </div>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this group room?">
        <p className="text-sm text-muted">Every seat your crew picked will be released back on sale. This can’t be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep room</Button>
          <Button
            variant="danger"
            loading={busy === 'cancel'}
            onClick={() => act('cancel', () => api.del(`/groups/${room.code}`), 'Room cancelled').then(() => setConfirmCancel(false))}
          >
            Cancel room
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: GroupStateDTO['status'] }) {
  const map: Record<GroupStateDTO['status'], [string, 'success' | 'gold' | 'primary' | 'danger' | 'muted']> = {
    OPEN: ['Picking seats', 'success'],
    LOCKED: ['Locked', 'gold'],
    PAYING: ['Paying', 'gold'],
    COMPLETED: ['Completed', 'primary'],
    EXPIRED: ['Expired', 'danger'],
    CANCELLED: ['Cancelled', 'muted'],
  };
  const [label, tone] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}
