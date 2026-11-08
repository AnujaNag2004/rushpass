import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const fn = (payload: T) => ref.current(payload);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [event, enabled]);
}

/** Emits `joinEvent` now and on every reconnect; emits `leaveEvent` on unmount. */
export function useSocketRoom(joinEvent: string, leaveEvent: string, arg: unknown, enabled = true) {
  const key = JSON.stringify(arg);
  useEffect(() => {
    if (!enabled || arg == null) return;
    const socket = getSocket();
    const join = () => socket.emit(joinEvent, arg);
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit(leaveEvent, arg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinEvent, leaveEvent, key, enabled]);
}
