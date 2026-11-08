import crypto from 'node:crypto';
import { config } from '../../config.js';
import type { PaymentProvider, VerifyInput } from './provider.js';

/**
 * A fake gateway so the whole app works with zero keys. Signatures are real HMACs,
 * so the confirm endpoint cannot be tricked with a made-up payment id.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'MOCK' as const;

  async createOrder() {
    return { orderId: `mock_order_${crypto.randomBytes(9).toString('hex')}` };
  }

  sign(orderId: string, paymentId: string) {
    return crypto.createHmac('sha256', config.TICKET_QR_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  }

  newPaymentId() {
    return `mock_pay_${crypto.randomBytes(9).toString('hex')}`;
  }

  verifyPayment({ orderId, paymentId, signature }: VerifyInput) {
    if (!signature) return false;
    const expected = this.sign(orderId, paymentId);
    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  verifyWebhook() {
    return false;
  }

  async refund() {
    // Nothing to do: money never moved.
  }
}
