import type { PaymentProviderName } from '@rushpass/shared';
import { config } from '../../config.js';
import { MockProvider } from './mock.js';
import type { PaymentProvider } from './provider.js';
import { RazorpayProvider } from './razorpay.js';

export const mockProvider = new MockProvider();

const razorpay =
  config.razorpayEnabled && config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET
    ? new RazorpayProvider(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
    : null;

/** Razorpay when keys are configured, otherwise the mock gateway. */
export function activeProvider(): PaymentProvider {
  return razorpay ?? mockProvider;
}

export function providerByName(name: PaymentProviderName): PaymentProvider {
  if (name === 'RAZORPAY') {
    if (!razorpay) throw new Error('Razorpay is not configured');
    return razorpay;
  }
  return mockProvider;
}

export type { PaymentProvider };
