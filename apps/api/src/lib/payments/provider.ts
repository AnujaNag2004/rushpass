import type { PaymentProviderName } from '@rushpass/shared';

export interface CreateOrderResult {
  orderId: string;
}

export interface VerifyInput {
  orderId: string;
  paymentId: string;
  signature?: string;
}

/** Strategy interface: every payment gateway implements the same contract. */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly publicKey?: string;
  createOrder(amountPaise: number, receipt: string): Promise<CreateOrderResult>;
  verifyPayment(input: VerifyInput): boolean;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  refund(paymentId: string, amountPaise: number): Promise<void>;
}
