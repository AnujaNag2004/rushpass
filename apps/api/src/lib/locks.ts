import { keys, redis } from './redis.js';

/**
 * Atomically locks every seat or none of them.
 * KEYS = seat keys, ARGV[1] = holdId, ARGV[2] = ttl in ms.
 * Returns 0 on success, otherwise the 1-based index of the first conflicting key.
 * Re-locking a seat already owned by the same hold is allowed (and refreshes nothing).
 */
const LOCK_ALL_LUA = `
for i, key in ipairs(KEYS) do
  local owner = redis.call('GET', key)
  if owner and owner ~= ARGV[1] then
    return i
  end
end
for i, key in ipairs(KEYS) do
  redis.call('SET', key, ARGV[1], 'PX', ARGV[2])
end
return 0
`;

/** Deletes keys only if they are still owned by ARGV[1]. Returns the number released. */
const RELEASE_LUA = `
local n = 0
for i, key in ipairs(KEYS) do
  if redis.call('GET', key) == ARGV[1] then
    redis.call('DEL', key)
    n = n + 1
  end
end
return n
`;

/** Extends TTL of keys owned by ARGV[1] to ARGV[2] ms. Returns the number extended. */
const EXTEND_LUA = `
local n = 0
for i, key in ipairs(KEYS) do
  if redis.call('GET', key) == ARGV[1] then
    redis.call('PEXPIRE', key, ARGV[2])
    n = n + 1
  end
end
return n
`;

export async function lockSeatsAtomic(showId: string, seatIds: string[], holdId: string, ttlMs: number) {
  const seatKeys = seatIds.map((id) => keys.seat(showId, id));
  const result = (await redis.eval(LOCK_ALL_LUA, seatKeys.length, ...seatKeys, holdId, String(ttlMs))) as number;
  if (result === 0) return { ok: true as const };
  return { ok: false as const, conflictSeatId: seatIds[result - 1] };
}

export async function releaseSeatsAtomic(showId: string, seatIds: string[], holdId: string) {
  if (!seatIds.length) return 0;
  const seatKeys = seatIds.map((id) => keys.seat(showId, id));
  return (await redis.eval(RELEASE_LUA, seatKeys.length, ...seatKeys, holdId)) as number;
}

export async function extendSeatsAtomic(showId: string, seatIds: string[], holdId: string, ttlMs: number) {
  if (!seatIds.length) return 0;
  const seatKeys = seatIds.map((id) => keys.seat(showId, id));
  return (await redis.eval(EXTEND_LUA, seatKeys.length, ...seatKeys, holdId, String(ttlMs))) as number;
}

/** Returns the current owner (holdId) for each seat, or null. */
export async function seatOwners(showId: string, seatIds: string[]): Promise<(string | null)[]> {
  if (!seatIds.length) return [];
  return redis.mget(...seatIds.map((id) => keys.seat(showId, id)));
}
