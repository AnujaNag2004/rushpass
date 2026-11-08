import bcrypt from 'bcryptjs';
import type { AuthResponse } from '@rushpass/shared';
import { MEMBER_COLORS } from '@rushpass/shared';
import { conflict, unauthorized } from '../lib/errors.js';
import { createRefreshToken, hashToken, signAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { toUserDTO } from './dto.js';

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function issueTokens(user: Parameters<typeof toUserDTO>[0]) {
  const { token, hash } = createRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
  const response: AuthResponse = {
    user: toUserDTO(user),
    accessToken: signAccessToken({ sub: user.id, role: user.role, name: user.name }),
  };
  return { response, refreshToken: token };
}

export async function register(input: { name: string; email: string; password: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      avatarColor: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
    },
  });
  return issueTokens(user);
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw unauthorized('Email or password is incorrect');
  }
  return issueTokens(user);
}

/** Rotates the refresh token: the old one is revoked and a new pair is issued. */
export async function refresh(token: string | undefined) {
  if (!token) throw unauthorized('No session');
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    // Reuse of a revoked token means it may have leaked — revoke the whole family.
    if (record?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized('Session expired');
  }
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.user);
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return toUserDTO(user);
}

export async function updateMe(userId: string, data: { name?: string; avatarColor?: string }) {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toUserDTO(user);
}
