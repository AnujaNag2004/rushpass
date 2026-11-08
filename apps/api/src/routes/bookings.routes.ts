import { Router } from 'express';
import { ah } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import * as bookings from '../services/bookings.service.js';

export const bookingsRouter = Router();

bookingsRouter.use(requireAuth);

bookingsRouter.get(
  '/me',
  ah(async (req, res) => {
    res.json({ data: await bookings.listMine(me(req).sub) });
  }),
);

bookingsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json({ data: await bookings.getBooking(req.params.id, me(req)) });
  }),
);

bookingsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    res.json({ data: await bookings.cancelBooking(req.params.id, me(req)) });
  }),
);

bookingsRouter.get(
  '/:id/tickets.pdf',
  ah(async (req, res) => {
    const pdf = await bookings.bookingPdf(req.params.id, me(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rushpass-${req.params.id}.pdf"`);
    res.send(pdf);
  }),
);
