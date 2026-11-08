import { Router } from 'express';
import { lockSeatsSchema, updateShowSchema } from '@rushpass/shared';
import { ah, notFound } from '../lib/errors.js';
import { me, requireAuth, requireRole } from '../middleware/auth.js';
import { queueLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import * as events from '../services/events.service.js';
import * as groups from '../services/groups.service.js';
import * as holds from '../services/holds.service.js';
import * as queue from '../services/queue.service.js';
import { getShowSeats } from '../services/seatState.service.js';
import { toShowDTO } from '../services/dto.js';

export const showsRouter = Router();

showsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const show = await prisma.show.findUnique({
      where: { id: req.params.id },
      include: { venue: { include: { _count: { select: { seats: true } } } }, event: true },
    });
    if (!show) throw notFound('Show');
    res.json({
      data: {
        ...toShowDTO(show),
        event: { id: show.event.id, title: show.event.title, slug: show.event.slug, bannerUrl: show.event.bannerUrl },
      },
    });
  }),
);

showsRouter.get(
  '/:id/seats',
  ah(async (req, res) => {
    res.json({ data: await getShowSeats(req.params.id) });
  }),
);

showsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ORGANIZER'),
  validate(updateShowSchema),
  ah(async (req, res) => {
    res.json({ data: await events.updateShow(req.params.id, req.body, me(req)) });
  }),
);

/** Lock seats (solo, or inside a group room when groupCode is given). */
showsRouter.post(
  '/:id/holds',
  requireAuth,
  validate(lockSeatsSchema),
  ah(async (req, res) => {
    const userId = me(req).sub;
    const { seatIds, groupCode } = req.body as { seatIds: string[]; groupCode?: string };
    const hold = groupCode
      ? await groups.selectSeats(groupCode, userId, seatIds)
      : (await holds.lockSeats({ showId: req.params.id, userId, seatIds })).hold;
    res.status(201).json({ data: hold });
  }),
);

showsRouter.get(
  '/:id/holds/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ data: await holds.getMyHold(req.params.id, me(req).sub) });
  }),
);

showsRouter.post(
  '/:id/queue/join',
  requireAuth,
  queueLimiter,
  ah(async (req, res) => {
    res.json({ data: await queue.joinQueue(req.params.id, me(req).sub) });
  }),
);

showsRouter.get(
  '/:id/queue/status',
  requireAuth,
  ah(async (req, res) => {
    res.json({ data: await queue.getStatus(req.params.id, me(req).sub) });
  }),
);
