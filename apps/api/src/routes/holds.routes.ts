import { Router } from 'express';
import { z } from 'zod';
import { ah, forbidden } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as groups from '../services/groups.service.js';
import * as holds from '../services/holds.service.js';

export const holdsRouter = Router();

holdsRouter.use(requireAuth);

holdsRouter.get(
  '/:holdId',
  ah(async (req, res) => {
    const hold = await holds.getHoldDTO(req.params.holdId);
    const userId = me(req).sub;
    if (hold.kind === 'SOLO' && !hold.seats.every((s) => s.userId === userId)) throw forbidden();
    res.json({ data: hold });
  }),
);

/** Release the whole hold (solo) or all of my seats in it (group). */
holdsRouter.delete(
  '/:holdId',
  ah(async (req, res) => {
    const hold = await holds.readHold(req.params.holdId);
    const userId = me(req).sub;
    const released =
      hold?.kind === 'GROUP' && hold.groupCode
        ? await groups.releaseSeats(hold.groupCode, userId, Object.keys(await holds.holdSeatMap(hold.id)))
        : await holds.releaseSeats(req.params.holdId, userId);
    res.json({ data: { released } });
  }),
);

const releaseSchema = z.object({ seatIds: z.array(z.string()).min(1).max(16) });

/** Release specific seats. */
holdsRouter.post(
  '/:holdId/release',
  validate(releaseSchema),
  ah(async (req, res) => {
    const hold = await holds.readHold(req.params.holdId);
    const userId = me(req).sub;
    const { seatIds } = req.body as z.infer<typeof releaseSchema>;
    const released =
      hold?.kind === 'GROUP' && hold.groupCode
        ? await groups.releaseSeats(hold.groupCode, userId, seatIds)
        : await holds.releaseSeats(req.params.holdId, userId, seatIds);
    res.json({ data: { released } });
  }),
);
