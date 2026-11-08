import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock, Send, SmilePlus, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActivityItem, ChatMessage, GroupMemberDTO } from '@rushpass/shared';
import { REACTION_EMOJIS } from '@rushpass/shared';
import { cn, formatTime } from '../lib/format';
import { Avatar } from './Brand';

/* ------------------------------- ActivityFeed ------------------------------ */

export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  return (
    <ol className={cn('space-y-2', className)} aria-live="polite">
      <AnimatePresence initial={false}>
        {items.slice(0, 12).map((a) => (
          <motion.li
            key={a.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 text-sm"
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.color ?? 'rgb(var(--muted))' }} />
            <span className="flex-1 text-text/90">{a.text}</span>
            <time className="shrink-0 font-mono text-[10px] text-muted">{formatTime(new Date(a.at))}</time>
          </motion.li>
        ))}
      </AnimatePresence>
      {!items.length && <li className="text-sm text-muted">Nothing yet — pick a seat to get things going.</li>}
    </ol>
  );
}

/* --------------------------------- ChatPanel ------------------------------- */

export function ChatPanel({
  messages,
  myUserId,
  onSend,
  onReact,
  className,
}: {
  messages: ChatMessage[];
  myUserId?: string;
  onSend: (text: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.map((m) => {
          const mine = m.userId === myUserId;
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('group flex gap-2', mine && 'flex-row-reverse')}>
              <Avatar name={m.name} color={m.color} size={28} />
              <div className={cn('max-w-[78%]', mine && 'items-end text-right')}>
                <div className="mb-0.5 text-[11px] text-muted">
                  {mine ? 'You' : m.name.split(' ')[0]} · {formatTime(new Date(m.at))}
                </div>
                <div className="relative inline-block">
                  <div
                    className={cn(
                      'rounded-2xl px-3 py-2 text-left text-sm',
                      mine ? 'rounded-tr-sm bg-primary text-white' : 'rounded-tl-sm border border-border bg-surface-2',
                    )}
                  >
                    {m.text}
                  </div>
                  <button
                    onClick={() => setPicker(picker === m.id ? null : m.id)}
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 rounded-full p-1 text-muted opacity-0 transition hover:text-text group-hover:opacity-100 focus:opacity-100',
                      mine ? '-left-7' : '-right-7',
                    )}
                    aria-label="React"
                  >
                    <SmilePlus className="h-4 w-4" />
                  </button>
                  {picker === m.id && (
                    <div className={cn('absolute z-10 mt-1 flex gap-1 rounded-full border border-border bg-surface p-1 shadow-card', mine ? 'right-0' : 'left-0')}>
                      {REACTION_EMOJIS.map((e) => (
                        <button
                          key={e}
                          className="rounded-full px-1.5 py-0.5 text-base transition hover:scale-125 hover:bg-surface-2"
                          onClick={() => {
                            onReact(m.id, e);
                            setPicker(null);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {Object.keys(m.reactions).length > 0 && (
                  <div className={cn('mt-1 flex flex-wrap gap-1', mine && 'justify-end')}>
                    {Object.entries(m.reactions).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => onReact(m.id, emoji)}
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 text-xs',
                          myUserId && users.includes(myUserId) ? 'border-primary/50 bg-primary/15' : 'border-border bg-surface-2',
                        )}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        {!messages.length && <p className="py-6 text-center text-sm text-muted">Say hi to your crew 👋</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder="Message the group…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          aria-label="Chat message"
        />
        <button type="submit" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-btn bg-primary text-white transition hover:bg-primary/90 disabled:opacity-40" disabled={!text.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/* ---------------------------- PaymentStatusBoard --------------------------- */

export function PaymentStatusBoard({ members, shares }: { members: GroupMemberDTO[]; shares: Record<string, number> }) {
  const payers = members.filter((m) => m.seatIds.length || m.paymentStatus !== 'NONE');
  const paid = payers.filter((m) => m.paymentStatus === 'PAID').length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold">Split payment</span>
        <span className="font-mono text-muted">
          {paid}/{payers.length} paid
        </span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full bg-signature" initial={{ width: 0 }} animate={{ width: `${payers.length ? (paid / payers.length) * 100 : 0}%` }} />
      </div>
      <ul className="space-y-2">
        {payers.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
            <Avatar name={m.name} color={m.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="text-xs text-muted">{m.seatIds.length} seat(s)</div>
            </div>
            <span className="font-mono text-sm">{shares[m.userId] !== undefined ? `₹${(shares[m.userId] / 100).toLocaleString('en-IN')}` : ''}</span>
            {m.paymentStatus === 'PAID' ? (
              <CheckCircle2 className="h-5 w-5 text-success" aria-label="paid" />
            ) : m.paymentStatus === 'FAILED' ? (
              <XCircle className="h-5 w-5 text-danger" aria-label="failed" />
            ) : (
              <Clock className="h-5 w-5 animate-pulse text-gold" aria-label="pending" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------- QueueProgress ----------------------------- */

export function QueueProgress({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="relative h-full rounded-full bg-signature"
        animate={{ width: `${Math.max(4, value * 100)}%` }}
        transition={{ type: 'spring', damping: 30, stiffness: 80 }}
      >
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      </motion.div>
    </div>
  );
}
