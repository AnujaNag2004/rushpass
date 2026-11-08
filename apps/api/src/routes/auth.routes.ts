import { Router, type Response } from 'express';
import { loginSchema, registerSchema, updateProfileSchema } from '@rushpass/shared';
import { config } from '../config.js';
import { ah } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as auth from '../services/auth.service.js';

export const REFRESH_COOKIE = 'rp_refresh';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: auth.REFRESH_TTL_MS,
  });
}

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  ah(async (req, res) => {
    const { response, refreshToken } = await auth.register(req.body);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ data: response });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  ah(async (req, res) => {
    const { response, refreshToken } = await auth.login(req.body);
    setRefreshCookie(res, refreshToken);
    res.json({ data: response });
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const { response, refreshToken } = await auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    setRefreshCookie(res, refreshToken);
    res.json({ data: response });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    await auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.json({ data: { ok: true } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ data: await auth.getMe(me(req).sub) });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  ah(async (req, res) => {
    res.json({ data: await auth.updateMe(me(req).sub, req.body) });
  }),
);
