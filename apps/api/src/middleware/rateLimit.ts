import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { config } from '../config.js';
import { redis } from '../lib/redis.js';

function store(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
  });
}

const message = { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down a little' } };

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  store: config.isTest ? undefined : store('rl:api:'),
  message,
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  store: config.isTest ? undefined : store('rl:auth:'),
  message,
});

/** Per-IP limit on joining a drop queue (bots love this endpoint). */
export const queueLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  store: config.isTest ? undefined : store('rl:queue:'),
  message,
});
