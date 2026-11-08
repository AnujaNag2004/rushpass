import { Router } from 'express';
import { createEventSchema, createShowSchema, eventQuerySchema, updateEventSchema } from '@rushpass/shared';
import { ah } from '../lib/errors.js';
import { me, optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as events from '../services/events.service.js';

export const eventsRouter = Router();

eventsRouter.get(
  '/',
  optionalAuth,
  validate(eventQuerySchema, 'query'),
  ah(async (req, res) => {
    res.json(await events.listEvents(req.query as never, req.user));
  }),
);

eventsRouter.get(
  '/:slug',
  optionalAuth,
  ah(async (req, res) => {
    res.json({ data: await events.getEvent(req.params.slug, req.user) });
  }),
);

eventsRouter.post(
  '/',
  requireAuth,
  requireRole('ORGANIZER'),
  validate(createEventSchema),
  ah(async (req, res) => {
    res.status(201).json({ data: await events.createEvent(req.body, me(req)) });
  }),
);

eventsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ORGANIZER'),
  validate(updateEventSchema),
  ah(async (req, res) => {
    res.json({ data: await events.updateEvent(req.params.id, req.body, me(req)) });
  }),
);

eventsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('ORGANIZER'),
  ah(async (req, res) => {
    res.json({ data: await events.deleteEvent(req.params.id, me(req)) });
  }),
);

eventsRouter.post(
  '/:id/shows',
  requireAuth,
  requireRole('ORGANIZER'),
  validate(createShowSchema),
  ah(async (req, res) => {
    res.status(201).json({ data: await events.createShow(req.params.id, req.body, me(req)) });
  }),
);
