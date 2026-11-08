import { Router } from 'express';
import { chatSchema, createGroupSchema } from '@rushpass/shared';
import { ah } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as groups from '../services/groups.service.js';

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.post(
  '/',
  validate(createGroupSchema),
  ah(async (req, res) => {
    res.status(201).json({ data: await groups.createRoom(req.body.showId, me(req).sub) });
  }),
);

groupsRouter.get(
  '/:code',
  ah(async (req, res) => {
    res.json({ data: await groups.getState(req.params.code.toUpperCase()) });
  }),
);

groupsRouter.post(
  '/:code/join',
  ah(async (req, res) => {
    res.json({ data: await groups.joinRoom(req.params.code.toUpperCase(), me(req).sub) });
  }),
);

groupsRouter.post(
  '/:code/lockin',
  ah(async (req, res) => {
    res.json({ data: await groups.lockIn(req.params.code.toUpperCase(), me(req).sub) });
  }),
);

groupsRouter.post(
  '/:code/extend',
  ah(async (req, res) => {
    res.json({ data: await groups.extend(req.params.code.toUpperCase(), me(req).sub) });
  }),
);

groupsRouter.post(
  '/:code/chat',
  validate(chatSchema),
  ah(async (req, res) => {
    res.status(201).json({ data: await groups.postChat(req.params.code.toUpperCase(), me(req).sub, req.body.text) });
  }),
);

groupsRouter.delete(
  '/:code/members/:userId',
  ah(async (req, res) => {
    res.json({ data: await groups.kick(req.params.code.toUpperCase(), me(req).sub, req.params.userId) });
  }),
);

groupsRouter.delete(
  '/:code',
  ah(async (req, res) => {
    res.json({ data: await groups.cancelRoom(req.params.code.toUpperCase(), me(req).sub) });
  }),
);
