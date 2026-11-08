import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

/** Creates a new Redis connection. BullMQ requires maxRetriesPerRequest: null. */
export function createRedis(name = 'main') {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.error({ err: err.message, name }, 'redis error'));
  return client;
}

export const redis = createRedis('main');

/** Central place for every Redis key so the data layout is easy to read. */
export const keys = {
  seat: (showId: string, seatId: string) => `seat:${showId}:${seatId}`,
  hold: (holdId: string) => `hold:${holdId}`,
  holdSeats: (holdId: string) => `holdseats:${holdId}`,
  userHold: (showId: string, userId: string) => `userhold:${showId}:${userId}`,
  groupHold: (code: string) => `grouphold:${code}`,
  queue: (showId: string) => `queue:${showId}`,
  admit: (showId: string, userId: string) => `admit:${showId}:${userId}`,
  admittedCount: (showId: string) => `stats:admitted:${showId}`,
  presence: (code: string) => `presence:${code}`,
  chat: (code: string) => `chat:${code}`,
  activity: (code: string) => `activity:${code}`,
  idem: (userId: string, key: string) => `idem:${userId}:${key}`,
  metric: (name: string) => `metrics:${name}`,
};
