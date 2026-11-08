import type { Prisma } from '@prisma/client';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

export function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
) {
  prisma.auditLog
    .create({ data: { actorId, action, entity, entityId, meta } })
    .catch((err) => logger.warn({ err: err.message }, 'audit log failed'));
}
