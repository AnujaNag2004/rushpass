import { create } from 'zustand';
import type { UserDTO } from '@rushpass/shared';

type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  status: Status;
  setSession: (user: UserDTO, token: string) => void;
  setUser: (user: UserDTO) => void;
  clear: () => void;
}

/** The access token lives only in memory; the refresh token is an httpOnly cookie. */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'loading',
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authed' }),
  setUser: (user) => set({ user }),
  clear: () => set({ user: null, accessToken: null, status: 'anon' }),
}));
