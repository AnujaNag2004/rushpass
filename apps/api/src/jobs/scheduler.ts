import { Queue } from 'bullmq';
import { config } from '../config.js';
import { createRedis } from '../lib/redis.js';
import type { MailInput } from '../lib/mail.js';

/**
 * Thin producer-side wrapper around BullMQ queues. Services call these helpers;
 * workers live in jobs/workers.ts. When DISABLE_JOBS=true (tests) everything is a no-op.
 */
export const QUEUE_NAMES = { holds: 'holds', emails: 'emails', admitter: 'admitter' } as const;

let queues: { holds: Queue; emails: Queue; admitter: Queue } | null = null;

export function getQueues() {
  if (config.DISABLE_JOBS) return null;
  if (!queues) {
    const connection = createRedis('bullmq-producer');
    const defaultJobOptions = { removeOnComplete: 1000, removeOnFail: 1000 };
    queues = {
      holds: new Queue(QUEUE_NAMES.holds, { connection, defaultJobOptions }),
      emails: new Queue(QUEUE_NAMES.emails, {
        connection,
        defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      }),
      admitter: new Queue(QUEUE_NAMES.admitter, { connection, defaultJobOptions }),
    };
  }
  return queues;
}

export async function scheduleHoldExpiry(holdId: string, delayMs: number) {
  await getQueues()?.holds.add('expire-hold', { holdId }, { delay: Math.max(0, delayMs), jobId: `hold-${holdId}` });
}

export async function scheduleGroupExpiry(code: string, expiresAt: number) {
  await getQueues()?.holds.add(
    'expire-group',
    { code, expiresAt },
    { delay: Math.max(0, expiresAt - Date.now()), jobId: `group-${code}-${expiresAt}` },
  );
}

export async function enqueueEmail(kind: string, payload: MailInput | { bookingId: string }) {
  await getQueues()?.emails.add(kind, payload);
}

export async function closeQueues() {
  if (!queues) return;
  await Promise.all(Object.values(queues).map((q) => q.close()));
  queues = null;
}
