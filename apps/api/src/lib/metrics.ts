import { keys, redis } from './redis.js';

export type MetricName = 'locks_ok' | 'locks_conflict' | 'bookings_confirmed' | 'admitted_total';

export function incrMetric(name: MetricName, by = 1) {
  return redis.incrby(keys.metric(name), by).catch(() => 0);
}

export async function readMetrics() {
  const names: MetricName[] = ['locks_ok', 'locks_conflict', 'bookings_confirmed', 'admitted_total'];
  const values = await redis.mget(...names.map((n) => keys.metric(n)));
  return Object.fromEntries(names.map((n, i) => [n, Number(values[i] ?? 0)])) as Record<MetricName, number>;
}
