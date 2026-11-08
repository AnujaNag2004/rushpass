import { create } from 'zustand';

type Theme = 'dark' | 'light';

function initial(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' ? 'light' : 'dark';
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0A14' : '#FAF8FF');
    try {
      localStorage.setItem('rp-theme', theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
}));
