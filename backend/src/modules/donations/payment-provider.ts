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

export interface RefundInput {
  /** Our record's id (pass order id). */
  reference: string;
  providerOrderId: string | null;
  /** The captured payment's id at the gateway. */
  paymentReference: string | null;
  amount: string;
  currency: string;
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
  /** Sends money back for a captured payment (all or part). Throws if the gateway refuses. */
  refund?(input: RefundInput): Promise<{ refundReference: string }>;
  /** Must verify the provider's signature and throw on failure. */
  parseWebhook?(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<WebhookResult>;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
