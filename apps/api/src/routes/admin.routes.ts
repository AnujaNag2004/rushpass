import { Router } from 'express';
import { z } from 'zod';
import { checkinSchema, createVenueSchema, roleChangeSchema, venueLayoutSchema } from '@rushpass/shared';
import { ah } from '../lib/errors.js';
import { me, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { verifyTicket } from '../services/checkin.service.js';
import * as dash from '../services/dashboard.service.js';
import * as venues from '../services/venues.service.js';

/* ------------------------------- venues ------------------------------- */

export const venuesRouter = Router();
venuesRouter.use(requireAuth, requireRole('ORGANIZER'));

venuesRouter.get(
  '/',
  ah(async (req, res) => {
    res.json({ data: await venues.listVenues(me(req)) });
  }),
);
venuesRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json({ data: await venues.getVenue(req.params.id, me(req)) });
  }),
);
venuesRouter.post(
  '/',
  validate(createVenueSchema),
  ah(async (req, res) => {
    res.status(201).json({ data: await venues.createVenue(req.body, me(req)) });
  }),
);
venuesRouter.put(
  '/:id/layout',
  validate(venueLayoutSchema),
  ah(async (req, res) => {
    res.json({ data: await venues.updateLayout(req.params.id, req.body, me(req)) });
  }),
);

/* ------------------------------- check-in ------------------------------ */

export const checkinRouter = Router();
checkinRouter.post(
  '/verify',
  requireAuth,
  requireRole('STAFF', 'ORGANIZER'),
  validate(checkinSchema),
  ah(async (req, res) => {
    res.json({ data: await verifyTicket(req.body.token, me(req).sub) });
  }),
);

/* ------------------------------ organizer ------------------------------ */

export const organizerRouter = Router();
organizerRouter.use(requireAuth, requireRole('ORGANIZER'));
organizerRouter.get(
  '/stats',
  ah(async (req, res) => {
    res.json({ data: await dash.organizerStats(me(req)) });
  }),
);
organizerRouter.get(
  '/shows/:id/occupancy',
  ah(async (req, res) => {
    res.json({ data: await dash.showOccupancy(req.params.id, me(req)) });
  }),
);

/* -------------------------------- admin -------------------------------- */

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get(
  '/stats',
  ah(async (_req, res) => {
    res.json({ data: await dash.adminStats() });
  }),
);

const usersQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
adminRouter.get(
  '/users',
  validate(usersQuery, 'query'),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof usersQuery>;
    res.json(await dash.listUsers(q.q, q.page, q.pageSize));
  }),
);
adminRouter.patch(
  '/users/:id/role',
  validate(roleChangeSchema),
  ah(async (req, res) => {
    res.json({ data: await dash.changeRole(req.params.id, req.body.role, me(req)) });
  }),
);
adminRouter.get(
  '/rush-monitor',
  ah(async (_req, res) => {
    res.json({ data: await dash.rushMonitor() });
  }),
);
