import { PaymentStatus } from '@prisma/client';

export interface CreatePaymentInput {
  /** Our record's id (donation id, pass order id) — the gateway's receipt reference. */
  reference: string;
  amount: string;
  currency: string;
  payerName: string;
  description: string;
}

export interface CreatePaymentResult {
  /** SUCCESS when money is already in hand (cash / manual), PENDING for a gateway. */
  status: 'SUCCESS' | 'PENDING';
  providerOrderId: string | null;
  checkoutUrl?: string;
  upiUri?: string;
}

export interface WebhookResult {
  providerOrderId: string;
  status: PaymentStatus;
  paymentReference?: string;
}

/**
 * Payment-provider boundary. Donations and pass orders only talk to this interface, so
 * adding Razorpay/PhonePe/Stripe/etc. means one new class registered in
 * PAYMENT_PROVIDERS — no change to the donation flow, schema or API.
 */
export interface PaymentProvider {
  readonly key: string;
  readonly label: string;
  readonly online: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Must verify the provider's signature and throw on failure. */
  parseWebhook?(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<WebhookResult>;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
