import type { Server } from 'socket.io';

/** Holds the Socket.io server so services can broadcast without import cycles. */
let io: Server | null = null;

export function setIO(server: Server | null) {
  io = server;
}

export function getIO() {
  return io;
}

export function emitTo(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

export const rooms = {
  show: (showId: string) => `show:${showId}`,
  group: (code: string) => `group:${code}`,
  queue: (showId: string) => `queue:${showId}`,
  user: (userId: string) => `user:${userId}`,
};
