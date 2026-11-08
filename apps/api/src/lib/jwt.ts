import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@rushpass/shared';
import { config } from '../config.js';

export interface AccessPayload {
  sub: string;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessPayload) {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return crypto.createHmac('sha256', config.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export interface TicketPayload {
  bid: string;
}

export function signTicketToken(bookingId: string) {
  return jwt.sign({ bid: bookingId } satisfies TicketPayload, config.TICKET_QR_SECRET, { expiresIn: '400d' });
}

export function verifyTicketToken(token: string): TicketPayload {
  return jwt.verify(token, config.TICKET_QR_SECRET) as TicketPayload;
}

export function signAdmissionToken(showId: string, userId: string) {
  return jwt.sign({ sid: showId, sub: userId }, config.ADMISSION_SECRET, { expiresIn: '10m' });
}
