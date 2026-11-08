import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Hourglass, PartyPopper, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { QueueStatusDTO, ShowDTO } from '@rushpass/shared';
import { SOCKET } from '@rushpass/shared';
import { GradientMesh } from '../components/Brand';
import { Banner } from '../components/Booking';
import { QueueProgress } from '../components/Live';
import { Button } from '../components/ui/Button';
import { PageLoader } from '../components/ui';
import { useCountdown } from '../hooks/useCountdown';
import { useSocketEvent, useSocketRoom } from '../hooks/useSocket';
import { ApiError, api, errorMessage } from '../lib/api';
import { duration, formatDateTime, mmss } from '../lib/format';

const TIPS = [
  'Refreshing this page keeps your spot — no need to panic-click.',
  'Everyone who joined before the sale opened got a random, fair position.',
  'Once you’re in, you have 10 minutes to pick seats.',
  'Have your payment ready — seats are held for 5 minutes at checkout.',
  'One spot per account. Bots get rate-limited at the door.',
];

type ShowInfo = ShowDTO & { event: { title: string; slug: string; bannerUrl: string } };

export default function WaitingRoomPage() {
  const { id: showId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<QueueStatusDTO | null>(null);
  const [tip, setTip] = useState(0);
  const initialAhead = useRef<number | null>(null);

  const show = useQuery({ queryKey: ['show', showId], queryFn: () => api.get<ShowInfo>(`/shows/${showId}`) });

  // Join on arrival (idempotent: re-joining keeps the same spot).
  useEffect(() => {
    api
      .post<QueueStatusDTO>(`/shows/${showId}/queue/join`)
      .then(setStatus)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 400) navigate(`/shows/${showId}/seats`, { replace: true });
        else toast.error(errorMessage(err));
      });
  }, [showId, navigate]);

  const poll = useQuery({
    queryKey: ['queue', showId],
    queryFn: () => api.get<QueueStatusDTO>(`/shows/${showId}/queue/status`),
    enabled: !!status,
    refetchInterval: 3000,
  });
  useEffect(() => {
    if (poll.data) setStatus(poll.data);
  }, [poll.data]);

  useSocketRoom(SOCKET.QUEUE_WATCH, SOCKET.QUEUE_UNWATCH, showId);
  useSocketEvent(SOCKET.QUEUE_TICK, () => poll.refetch());
  useSocketEvent<{ showId: string }>(SOCKET.QUEUE_ADMITTED, (p) => {
    if (p.showId === showId) poll.refetch();
  });

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status?.saleOpen && status.inQueue && initialAhead.current === null) initialAhead.current = Math.max(1, status.ahead);
    if (status?.admitted) {
      toast.success("You're in! Pick your seats.");
      const t = setTimeout(() => navigate(`/shows/${showId}/seats`), 1800);
      return () => clearTimeout(t);
    }
  }, [status?.admitted, status?.saleOpen, status?.inQueue, status?.ahead, navigate, showId]);

  const opensIn = useCountdown(status?.saleOpensAt ?? null, 1000);
  const admissionLeft = useCountdown(status?.admissionExpiresAt ?? null, 1000);

  if (!status || show.isLoading) return <PageLoader />;

  const progress = status.admitted ? 1 : initialAhead.current ? 1 - status.ahead / initialAhead.current : 0;
  const beforeOpen = !status.saleOpen && (opensIn ?? 0) > 0;

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
      <GradientMesh intense />
      <div className="container-page flex max-w-3xl flex-col items-center py-12 text-center">
        {show.data && (
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface/60 py-1.5 pl-1.5 pr-4 backdrop-blur">
            <Banner src={show.data.event.bannerUrl} alt="" className="h-9 w-9 rounded-full" />
            <div className="text-left">
              <div className="text-sm font-semibold leading-tight">{show.data.event.title}</div>
              <div className="text-xs text-muted">{formatDateTime(show.data.startsAt)}</div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {status.admitted ? (
            <motion.div key="in" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-14">
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-signature text-white shadow-glow">
                <PartyPopper className="h-10 w-10" />
              </span>
              <h1 className="mt-6 text-5xl font-bold">You’re in!</h1>
              <p className="mt-2 text-muted">
                You have <span className="font-mono text-text">{admissionLeft != null ? mmss(admissionLeft) : '10:00'}</span> to pick your seats.
              </p>
              <Button variant="gradient" size="lg" className="mt-8" onClick={() => navigate(`/shows/${showId}/seats`)}>
                Pick seats now <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          ) : beforeOpen ? (
            <motion.div key="before" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-14 w-full">
              <div className="text-sm font-medium uppercase tracking-[0.3em] text-muted">Sale opens in</div>
              <div className="mt-3 font-mono text-[clamp(3.5rem,14vw,7rem)] font-bold leading-none tabular-nums text-gradient">{mmss(opensIn ?? 0)}</div>
              <div className="card mx-auto mt-10 max-w-md p-5 text-left">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
                  <div>
                    <div className="font-semibold">You’re in the early lobby</div>
                    <div className="text-sm text-muted">
                      When the sale opens, everyone here gets a <b className="text-text">random</b> place in line — arriving first doesn’t require a faster internet connection.
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                  <Users className="h-4 w-4" /> <span className="font-mono text-text">{status.total}</span> people waiting with you
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="queue" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-12 w-full">
              <div className="text-sm font-medium uppercase tracking-[0.3em] text-muted">Your place in line</div>
              <motion.div key={status.position} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-2 font-display text-[clamp(4rem,18vw,9rem)] font-bold leading-none tabular-nums">
                <span className="text-gradient">#{status.position ?? '—'}</span>
              </motion.div>
              <div className="mx-auto mt-8 max-w-lg">
                <QueueProgress value={progress} />
                <div className="mt-3 flex justify-between text-sm text-muted">
                  <span>
                    <span className="font-mono text-text">{status.ahead}</span> ahead
                  </span>
                  <span>
                    ~<span className="font-mono text-text">{status.estimatedWaitSec != null ? duration(status.estimatedWaitSec) : '—'}</span> wait
                  </span>
                  <span>
                    <span className="font-mono text-text">{status.behind}</span> behind you
                  </span>
                </div>
              </div>
              <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-sm text-muted">
                <Hourglass className="h-4 w-4 animate-pulse text-gold" /> Admitting ~{status.admitPerMinute} people per minute
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!status.admitted && (
          <div className="mt-14 h-12">
            <AnimatePresence mode="wait">
              <motion.p key={tip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-sm text-muted">
                💡 {TIPS[tip]}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
