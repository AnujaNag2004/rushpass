import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SeatUpdatePayload, ShowSeatsResponse } from '@rushpass/shared';
import { SOCKET } from '@rushpass/shared';
import { api } from '../lib/api';
import { useSocketEvent, useSocketRoom } from './useSocket';

/** Seat map data for a show, kept live by Socket.io seat:update broadcasts. */
export function useShowSeats(showId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['seats', showId],
    queryFn: () => api.get<ShowSeatsResponse>(`/shows/${showId}/seats`),
    enabled: !!showId,
    refetchInterval: 30_000, // safety net if a socket message is missed
  });

  useSocketRoom(SOCKET.SHOW_JOIN, SOCKET.SHOW_LEAVE, showId, !!showId);

  useSocketEvent<SeatUpdatePayload>(SOCKET.SEAT_UPDATE, (payload) => {
    if (payload.showId !== showId) return;
    qc.setQueryData<ShowSeatsResponse>(['seats', showId], (prev) => {
      if (!prev) return prev;
      const states = { ...prev.states };
      for (const st of payload.states) {
        if (st.status === 'AVAILABLE') delete states[st.seatId];
        else states[st.seatId] = st;
      }
      return { ...prev, states, show: { ...prev.show, seatsLeft: prev.seats.length - Object.keys(states).length } };
    });
  });

  return query;
}
