import 'dotenv/config';
import { z } from 'zod';

const DEV_DEFAULT = 'dev-only-secret-change-me-in-production';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    JWT_ACCESS_SECRET: z.string().default(`${DEV_DEFAULT}-access`),
    JWT_REFRESH_SECRET: z.string().default(`${DEV_DEFAULT}-refresh`),
    TICKET_QR_SECRET: z.string().default(`${DEV_DEFAULT}-qr`),
    ADMISSION_SECRET: z.string().default(`${DEV_DEFAULT}-admission`),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('RushPass <tickets@rushpass.dev>'),
    RATE_LIMIT_MAX: z.coerce.number().default(600),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().default(30),
    DISABLE_JOBS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    LOG_LEVEL: z.string().default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TICKET_QR_SECRET', 'ADMISSION_SECRET'] as const) {
      if (env[key].startsWith(DEV_DEFAULT)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} must be set in production` });
      }
    }
  });

// Treat blank values (e.g. `JWT_ACCESS_SECRET=` copied from .env.example) as unset so defaults apply.
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''));
const parsed = schema.safeParse(env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  razorpayEnabled: !!(parsed.data.RAZORPAY_KEY_ID && parsed.data.RAZORPAY_KEY_SECRET),
};

export type Config = typeof config;
