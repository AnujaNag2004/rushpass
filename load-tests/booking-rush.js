/**
 * RushPass booking rush — k6 load test.
 *
 * 1000 virtual users fight over the same show at once: they lock seats, create orders
 * and pay with the mock gateway. At the end the script asks the API how many seats
 * were sold twice. The answer must be 0.
 *
 * Run the API with the rate limits raised (everything comes from one IP):
 *   RATE_LIMIT_MAX=1000000 AUTH_RATE_LIMIT_MAX=1000000 npm run dev
 * Then:
 *   k6 run -e API_URL=http://localhost:4000 -e SHOW_ID=<show id> load-tests/booking-rush.js
 * Optional: -e VUS=1000 -e HOT_SEATS=40   (fewer hot seats = more contention)
 * Open /admin/rush-monitor while it runs.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const API = `${__ENV.API_URL || 'http://localhost:4000'}/api/v1`;
const SHOW_ID = __ENV.SHOW_ID;
const VUS = Number(__ENV.VUS || 1000);
const HOT_SEATS = Number(__ENV.HOT_SEATS || 40);

const locked = new Counter('seats_locked');
const rejected = new Counter('locks_rejected');
const booked = new Counter('bookings_confirmed');

export const options = {
  setupTimeout: '5m',
  scenarios: {
    rush: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '3m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.5'], // 409s are expected and counted separately
    checks: ['rate>0.95'],
  },
};

const json = (token) => ({
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});

export function setup() {
  if (!SHOW_ID) throw new Error('Pass -e SHOW_ID=<show id> (copy one from the seat page URL)');
  const seats = http.get(`${API}/shows/${SHOW_ID}/seats`).json('data.seats');
  const hot = seats.slice(0, HOT_SEATS).map((s) => s.id);

  // Register one throwaway account per virtual user, in batches.
  const runId = Date.now();
  const tokens = [];
  for (let i = 0; i < VUS; i += 50) {
    const reqs = [];
    for (let j = i; j < Math.min(VUS, i + 50); j++) {
      reqs.push([
        'POST',
        `${API}/auth/register`,
        JSON.stringify({ name: `Load ${j}`, email: `load-${runId}-${j}@k6.test`, password: 'Password@123' }),
        json(),
      ]);
    }
    for (const res of http.batch(reqs)) tokens.push(res.json('data.accessToken'));
  }
  const admin = http.post(`${API}/auth/login`, JSON.stringify({ email: 'admin@rushpass.dev', password: 'Password@123' }), json());
  return { hot, tokens, adminToken: admin.json('data.accessToken') };
}

export default function (data) {
  const token = data.tokens[__VU - 1];
  if (!token) return;
  const seatId = data.hot[Math.floor(Math.random() * data.hot.length)];

  const lock = http.post(`${API}/shows/${SHOW_ID}/holds`, JSON.stringify({ seatIds: [seatId] }), json(token));
  check(lock, { 'lock answered 201 or 409': (r) => r.status === 201 || r.status === 409 });
  if (lock.status !== 201) {
    rejected.add(1);
    return;
  }
  locked.add(1);

  const order = http.post(
    `${API}/checkout/orders`,
    JSON.stringify({ holdId: lock.json('data.holdId') }),
    { headers: { ...json(token).headers, 'Idempotency-Key': `${__VU}-${seatId}` } },
  );
  if (!check(order, { 'order created': (r) => r.status === 201 })) return;

  sleep(Math.random() * 2); // "typing card details"
  const pay = http.post(`${API}/checkout/mock/${order.json('data.orderId')}/pay`, null, json(token));
  if (check(pay, { 'payment confirmed': (r) => r.status === 200 })) booked.add(1);
}

export function teardown(data) {
  const res = http.get(`${API}/admin/rush-monitor`, json(data.adminToken));
  const doubles = res.json('data.doubleBookings');
  console.log(`\n=========================================\n  DOUBLE BOOKINGS: ${doubles}\n=========================================\n`);
  check(res, { 'zero double bookings': () => doubles === 0 });
}
