import { conflict } from './errors.js';
import { keys, redis } from './redis.js';

const TTL_SEC = 24 * 60 * 60;
const PENDING = '__pending__';

/**
 * Runs `fn` at most once per (user, Idempotency-Key). Repeated calls with the same key
 * get the stored result back; a concurrent duplicate gets 409 IN_PROGRESS.
 */
export async function withIdempotency<T>(userId: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const redisKey = keys.idem(userId, key);
  const claimed = await redis.set(redisKey, PENDING, 'EX', TTL_SEC, 'NX');
  if (!claimed) {
    const existing = await redis.get(redisKey);
    if (existing && existing !== PENDING) return JSON.parse(existing) as T;
    throw conflict('IN_PROGRESS', 'This request is already being processed');
  }
  try {
    const result = await fn();
    await redis.set(redisKey, JSON.stringify(result), 'EX', TTL_SEC);
    return result;
  } catch (err) {
    await redis.del(redisKey);
    throw err;
  }
}
