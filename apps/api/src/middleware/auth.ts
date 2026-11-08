import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@rushpass/shared';
import { forbidden, unauthorized } from '../lib/errors.js';
import { type AccessPayload, verifyAccessToken } from '../lib/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

function readToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Treat an invalid token on a public route as anonymous.
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(unauthorized('Your session expired, please log in again'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** The authenticated user. Only call after requireAuth. */
export function me(req: Request): AccessPayload {
  if (!req.user) throw unauthorized();
  return req.user;
}
