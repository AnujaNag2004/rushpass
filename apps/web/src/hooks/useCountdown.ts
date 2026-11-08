import { useEffect, useState } from 'react';

/** Milliseconds remaining until `target` (epoch ms or ISO), ticking every `interval` ms. */
export function useCountdown(target: number | string | null | undefined, interval = 250) {
  const t = target == null ? null : typeof target === 'number' ? target : new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (t == null) return;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [t, interval]);
  return t == null ? null : Math.max(0, t - now);
}
