import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { ah, errorHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { adminRouter, checkinRouter, organizerRouter, venuesRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { bookingsRouter } from './routes/bookings.routes.js';
import { checkoutRouter } from './routes/checkout.routes.js';
import { eventsRouter } from './routes/events.routes.js';
import { groupsRouter } from './routes/groups.routes.js';
import { holdsRouter } from './routes/holds.routes.js';
import { showsRouter } from './routes/shows.routes.js';
import { handleRazorpayWebhook } from './services/checkout.service.js';

export function allowedOrigins() {
  return config.CLIENT_URL.split(',').map((o) => o.trim());
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customSuccessMessage: (req, res, ms) =>
        `${req.method} ${(req as express.Request).originalUrl ?? req.url} → ${res.statusCode} (${Math.round(ms)}ms)`,
      customErrorMessage: (req, res) => `${req.method} ${(req as express.Request).originalUrl ?? req.url} → ${res.statusCode}`,
    }),
  );

  // Razorpay webhooks need the raw body for signature verification, so mount before express.json().
  app.post(
    '/api/v1/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    ah(async (req, res) => {
      res.json({ data: await handleRazorpayWebhook(req.body as Buffer, req.header('x-razorpay-signature')) });
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = Router();
  api.get(
    '/health',
    ah(async (_req, res) => {
      const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
      const ok = db.status === 'fulfilled' && cache.status === 'fulfilled';
      res.status(ok ? 200 : 503).json({
        data: { status: ok ? 'ok' : 'degraded', db: db.status === 'fulfilled', redis: cache.status === 'fulfilled' },
      });
    }),
  );
  api.use(apiLimiter);
  api.use('/auth', authRouter);
  api.use('/events', eventsRouter);
  api.use('/shows', showsRouter);
  api.use('/holds', holdsRouter);
  api.use('/groups', groupsRouter);
  api.use('/checkout', checkoutRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/venues', venuesRouter);
  api.use('/checkin', checkinRouter);
  api.use('/organizer', organizerRouter);
  api.use('/admin', adminRouter);
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use('/api/v1', api);
  app.get('/', (_req, res) => {
    res.json({ name: 'RushPass API', docs: '/api/v1/health' });
  });
  app.use(errorHandler);
  return app;
}
