import { Router } from 'express';
import { checkoutOrderSchema, confirmPaymentSchema } from '@rushpass/shared';
import { ah } from '../lib/errors.js';
import { me, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as checkout from '../services/checkout.service.js';

export const checkoutRouter = Router();

checkoutRouter.use(requireAuth);

checkoutRouter.post(
  '/orders',
  validate(checkoutOrderSchema),
  ah(async (req, res) => {
    const order = await checkout.createOrder({
      userId: me(req).sub,
      holdId: req.body.holdId,
      groupCode: req.body.groupCode,
      idempotencyKey: req.header('Idempotency-Key') ?? undefined,
    });
    res.status(201).json({ data: order });
  }),
);

checkoutRouter.post(
  '/confirm',
  validate(confirmPaymentSchema),
  ah(async (req, res) => {
    res.json({ data: await checkout.confirmPayment({ ...req.body, userId: me(req).sub }) });
  }),
);

checkoutRouter.post(
  '/mock/:orderId/pay',
  ah(async (req, res) => {
    res.json({ data: await checkout.mockPay(req.params.orderId, me(req).sub) });
  }),
);

checkoutRouter.post(
  '/mock/:orderId/fail',
  ah(async (req, res) => {
    res.json({ data: await checkout.mockFail(req.params.orderId, me(req).sub) });
  }),
);
