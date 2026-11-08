import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, type Socket } from 'socket.io';
import { REACTION_EMOJIS, SOCKET } from '@rushpass/shared';
import { allowedOrigins } from '../app.js';
import { type AccessPayload, verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { createRedis } from '../lib/redis.js';
import { rooms, setIO } from '../lib/socket.js';
import * as groups from '../services/groups.service.js';

interface SocketData {
  user?: AccessPayload;
  groups: Set<string>;
}

type Ack = (res: { ok: boolean; error?: string }) => void;

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: allowedOrigins(), credentials: true },
    pingInterval: 20_000,
  });

  // Redis adapter lets several API instances share rooms (horizontal scaling).
  const pub = createRedis('socket-pub');
  const sub = createRedis('socket-sub');
  io.adapter(createAdapter(pub, sub));

  // Anonymous sockets are allowed (anyone can watch a seat map); groups require auth.
  io.use((socket, next) => {
    socket.data.groups = new Set();
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.data.user = verifyAccessToken(token);
      } catch {
        return next(new Error('UNAUTHORIZED'));
      }
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AccessPayload | undefined;
    if (user) socket.join(rooms.user(user.sub));

    const safe =
      <T>(fn: (payload: T, ack?: Ack) => Promise<void>) =>
      (payload: T, ack?: Ack) => {
        fn(payload, ack).catch((err: Error) => {
          logger.debug({ err: err.message }, 'socket handler error');
          ack?.({ ok: false, error: err.message });
        });
      };

    socket.on(SOCKET.SHOW_JOIN, (showId: string) => {
      if (typeof showId === 'string') socket.join(rooms.show(showId));
    });
    socket.on(SOCKET.SHOW_LEAVE, (showId: string) => {
      if (typeof showId === 'string') socket.leave(rooms.show(showId));
    });

    socket.on(SOCKET.QUEUE_WATCH, (showId: string) => {
      if (typeof showId === 'string') socket.join(rooms.queue(showId));
    });
    socket.on(SOCKET.QUEUE_UNWATCH, (showId: string) => {
      if (typeof showId === 'string') socket.leave(rooms.queue(showId));
    });

    socket.on(
      SOCKET.GROUP_JOIN,
      safe<string>(async (rawCode, ack) => {
        if (!user) throw new Error('Log in to join a group');
        const code = String(rawCode).toUpperCase();
        const member = await prisma.groupMember.findFirst({ where: { room: { code }, userId: user.sub } });
        if (!member) throw new Error('Not a member of this group');
        const groupsJoined = socket.data.groups as Set<string>;
        if (!groupsJoined.has(code)) {
          groupsJoined.add(code);
          socket.join(rooms.group(code));
          await groups.presenceChange(code, user.sub, 1);
        }
        ack?.({ ok: true });
      }),
    );

    socket.on(
      SOCKET.GROUP_LEAVE,
      safe<string>(async (rawCode) => {
        if (!user) return;
        const code = String(rawCode).toUpperCase();
        const groupsJoined = socket.data.groups as Set<string>;
        if (groupsJoined.delete(code)) {
          socket.leave(rooms.group(code));
          await groups.presenceChange(code, user.sub, -1);
        }
      }),
    );

    socket.on(SOCKET.GROUP_CURSOR, (payload: { code: string; seatId: string | null }) => {
      if (!user || !payload?.code) return;
      const code = String(payload.code).toUpperCase();
      if (!(socket.data.groups as Set<string>).has(code)) return;
      socket.to(rooms.group(code)).emit(SOCKET.GROUP_CURSOR, { userId: user.sub, seatId: payload.seatId ?? null });
    });

    socket.on(
      SOCKET.GROUP_CHAT,
      safe<{ code: string; text: string }>(async (payload, ack) => {
        if (!user) throw new Error('Log in first');
        const text = String(payload?.text ?? '').trim();
        if (!text) return;
        await groups.postChat(String(payload.code).toUpperCase(), user.sub, text);
        ack?.({ ok: true });
      }),
    );

    socket.on(
      SOCKET.GROUP_REACT,
      safe<{ code: string; messageId: string; emoji: string }>(async (payload) => {
        if (!user) return;
        if (!(REACTION_EMOJIS as readonly string[]).includes(payload?.emoji)) return;
        await groups.reactToChat(String(payload.code).toUpperCase(), user.sub, payload.messageId, payload.emoji);
      }),
    );

    socket.on('disconnect', () => {
      if (!user) return;
      for (const code of socket.data.groups as Set<string>) {
        groups.presenceChange(code, user.sub, -1).catch(() => undefined);
      }
    });
  });

  setIO(io as unknown as Server);
  return {
    io,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      setIO(null);
      pub.disconnect();
      sub.disconnect();
    },
  };
}
