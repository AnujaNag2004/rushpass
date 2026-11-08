import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CameraOff, CheckCircle2, Keyboard, ScanLine, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { cn, formatDateTime, formatTime } from '../../lib/format';

type Result =
  | { result: 'INVALID'; message: string }
  | { result: 'VALID' | 'ALREADY_USED'; message: string; holder: string; event: string; venue: string; startsAt: string; seats: string[]; checkedInAt: string };

/** Short tone via Web Audio: high double-beep for valid, low buzz for rejected. */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const play = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = ok ? 'sine' : 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    };
    if (ok) {
      play(880, 0, 0.12);
      play(1320, 0.14, 0.18);
    } else play(180, 0, 0.45);
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* audio not available */
  }
}

export default function CheckinPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState('');
  const [count, setCount] = useState(0);
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const busy = useRef(false);

  const verify = useCallback(async (token: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api.post<Result>('/checkin/verify', { token: token.trim() });
      setResult(r);
      beep(r.result === 'VALID');
      if (r.result === 'VALID') setCount((c) => c + 1);
      navigator.vibrate?.(r.result === 'VALID' ? 80 : [60, 60, 60]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTimeout(() => (busy.current = false), 1500);
    }
  }, []);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      await s.stop().catch(() => undefined);
      s.clear();
    }
    setScanning(false);
  }, []);

  const start = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => verify(text), () => undefined);
    } catch (err) {
      setScanning(false);
      toast.error(`Camera unavailable: ${errorMessage(err)}. Paste the code instead.`);
    }
  };

  useEffect(() => () => void stop(), [stop]);

  // Auto-dismiss the result after a few seconds so the next guest can scan.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3500);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ScanLine className="h-7 w-7 text-primary" /> Door check-in
          </h1>
          <p className="mt-1 text-muted">Scan a RushPass QR code. One scan admits every seat on the ticket.</p>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-bold">{count}</div>
          <div className="text-xs text-muted">admitted this session</div>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden p-4">
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
          <div id="qr-reader" className="h-full w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
          {!scanning && (
            <div className="absolute inset-0 grid place-items-center bg-surface-2 text-center">
              <div>
                <Camera className="mx-auto h-10 w-10 text-muted" />
                <p className="mt-2 text-sm text-muted">Camera is off</p>
              </div>
            </div>
          )}
          {scanning && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-signature shadow-[0_0_20px_#FF4D8D]" />}
        </div>
        <div className="mt-4 flex justify-center">
          {scanning ? (
            <Button variant="outline" onClick={stop} icon={<CameraOff className="h-4 w-4" />}>Stop camera</Button>
          ) : (
            <Button variant="gradient" onClick={start} icon={<Camera className="h-4 w-4" />}>Start scanning</Button>
          )}
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) verify(manual);
            setManual('');
          }}
        >
          <label className="relative flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9 font-mono text-xs" placeholder="…or paste the ticket code" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Ticket code" />
          </label>
          <Button type="submit" variant="solid">Verify</Button>
        </form>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setResult(null)}
            className={cn(
              'fixed inset-0 z-50 grid place-items-center p-6 text-center text-white',
              result.result === 'VALID' ? 'bg-[#0FA877]' : 'bg-[#DC3B3B]',
            )}
            role="alertdialog"
            aria-live="assertive"
          >
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}>
              {result.result === 'VALID' ? <CheckCircle2 className="mx-auto h-28 w-28" /> : <XCircle className="mx-auto h-28 w-28" />}
              <div className="mt-4 font-display text-5xl font-bold">
                {result.result === 'VALID' ? 'Welcome!' : result.result === 'ALREADY_USED' ? 'Already used' : 'Invalid ticket'}
              </div>
              {'holder' in result ? (
                <div className="mt-4 space-y-1 text-lg">
                  <div className="font-semibold">{result.holder}</div>
                  <div className="opacity-90">{result.event}</div>
                  <div className="text-sm opacity-80">{formatDateTime(result.startsAt)}</div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {result.seats.map((s) => (
                      <span key={s} className="rounded-lg bg-white/20 px-3 py-1 font-mono text-xl font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                  {result.result === 'ALREADY_USED' && <div className="mt-3 text-sm">First scanned at {formatTime(result.checkedInAt)}</div>}
                </div>
              ) : (
                <div className="mt-3 text-lg opacity-90">{result.message}</div>
              )}
              <div className="mt-8 text-sm opacity-70">Tap anywhere to scan the next guest</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
