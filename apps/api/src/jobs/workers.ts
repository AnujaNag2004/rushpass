import { Worker } from 'bullmq';
import { seatLabel } from '@rushpass/shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { emailLayout, sendMail } from '../lib/mail.js';
import { createRedis } from '../lib/redis.js';
import { renderPdfById } from '../services/bookings.service.js';
import { expireRoom } from '../services/groups.service.js';
import { expireHold } from '../services/holds.service.js';
import { TICK_MS, admitTick } from '../services/queue.service.js';
import { QUEUE_NAMES, getQueues } from './scheduler.js';

const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

async function bookingEmail(kind: string, bookingId: string) {
  const { booking, pdf } = await renderPdfById(bookingId);
  const when = booking.show.startsAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const seats = booking.seats.map((s) => seatLabel(s.seat)).join(', ') || booking.heldSeatIds.length + ' seat(s)';
  const link = `${config.CLIENT_URL.split(',')[0]}/tickets/${booking.id}`;
  if (kind === 'booking-confirmed') {
    await sendMail({
      to: booking.user.email,
      subject: `🎟️ You're in: ${booking.show.event.title}`,
      html: emailLayout(
        `You're going to ${booking.show.event.title}!`,
        `<p>${when} · ${booking.show.venue.name}, ${booking.show.venue.city}</p>
         <p>Seats: <b style="color:#F4F2FF">${seats}</b><br/>Paid: <b style="color:#F4F2FF">${rupees(booking.total)}</b></p>
         <p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#7C5CFF;color:#fff;text-decoration:none;font-weight:600">View ticket</a></p>
         <p>Your PDF ticket is attached.</p>`,
      ),
      attachments: [{ filename: `rushpass-${booking.id}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
  } else {
    await sendMail({
      to: booking.user.email,
      subject: `Booking cancelled: ${booking.show.event.title}`,
      html: emailLayout(
        'Your booking was cancelled',
        `<p>${booking.show.event.title} · ${when}</p><p>A refund of <b>${rupees(booking.total)}</b> is on its way.</p>`,
      ),
    });
  }
}

export async function startWorkers() {
  const queues = getQueues();
  if (!queues) return async () => undefined;
  const connection = createRedis('bullmq-worker');

  const holdsWorker = new Worker(
    QUEUE_NAMES.holds,
    async (job) => {
      if (job.name === 'expire-hold') await expireHold(job.data.holdId);
      if (job.name === 'expire-group') await expireRoom(job.data.code, job.data.expiresAt);
    },
    { connection, concurrency: 10 },
  );

  const emailWorker = new Worker(
    QUEUE_NAMES.emails,
    async (job) => {
      await bookingEmail(job.name, job.data.bookingId);
    },
    { connection, concurrency: 3 },
  );

  const admitterWorker = new Worker(QUEUE_NAMES.admitter, () => admitTick(), { connection, concurrency: 1 });
  await queues.admitter.upsertJobScheduler('admitter-tick', { every: TICK_MS }, { name: 'tick' });

  for (const w of [holdsWorker, emailWorker, admitterWorker]) {
    w.on('failed', (job, err) => logger.warn({ job: job?.name, err: err.message }, 'job failed'));
  }
  logger.info('⚙️  Background workers started');

  return async () => {
    await Promise.all([holdsWorker.close(), emailWorker.close(), admitterWorker.close()]);
    connection.disconnect();
  };
}
