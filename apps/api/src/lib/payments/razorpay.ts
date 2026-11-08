import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../../config.js';
import { logger } from '../logger.js';
import type { PaymentProvider, VerifyInput } from './provider.js';

function safeEqual(a: string, b: string) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'RAZORPAY' as const;
  readonly publicKey: string;
  private client: Razorpay;

  constructor(keyId: string, private keySecret: string) {
    this.publicKey = keyId;
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(amountPaise: number, receipt: string) {
    const order = await this.client.orders.create({ amount: amountPaise, currency: 'INR', receipt });
    return { orderId: order.id };
  }

  verifyPayment({ orderId, paymentId, signature }: VerifyInput) {
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', this.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqual(expected, signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !config.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  async refund(paymentId: string, amountPaise: number) {
    try {
      await this.client.payments.refund(paymentId, { amount: amountPaise });
    } catch (err) {
      logger.error({ err, paymentId }, 'razorpay refund failed — refund manually from the dashboard');
    }
  }
}
