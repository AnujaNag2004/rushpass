import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';
import { refreshAccessToken } from './api';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) || undefined;

let socket: Socket | null = null;
let lastToken: string | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL ?? window.location.origin, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: (cb) => cb({ token: useAuth.getState().accessToken ?? undefined }),
    });
    socket.on('connect_error', async (err) => {
      if (err.message === 'UNAUTHORIZED') {
        const fresh = await refreshAccessToken();
        if (!fresh) useAuth.getState().clear();
        socket?.connect();
      }
    });
    lastToken = useAuth.getState().accessToken;
    // Reconnect with the new identity when the user logs in or out.
    useAuth.subscribe((state) => {
      const changedIdentity = !!state.accessToken !== !!lastToken;
      lastToken = state.accessToken;
      if (changedIdentity && socket) {
        socket.disconnect();
        socket.connect();
      }
    });
  }
  return socket;
}
