import { randomBytes } from 'crypto';
import { CreatePaymentInput, CreatePaymentResult, PaymentProvider, RefundInput } from '../donations/payment-provider';

/**
 * Simulated online checkout for public pass sales. The visitor is sent to the
 * frontend's /pay/demo page, which confirms through
 * POST /public/booking/orders/:id/demo-pay — no money moves. Registered only
 * when BOOKING_DEMO_PAYMENTS=true. A real gateway (Razorpay, PhonePe…) is a
 * PaymentProvider with a signed webhook, added to buildPassGateways().
 */
export class DemoPassGateway implements PaymentProvider {
  readonly key = 'demo';
  readonly label = 'Demo payment (no real money)';
  readonly online = true;

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return { status: 'PENDING', providerOrderId: `demo_${randomBytes(8).toString('hex')}` };
  }

  /** Nothing to send back — returns a refund id so the flow behaves like a real gateway's. */
  async refund(_input: RefundInput) {
    return { refundReference: `demo_refund_${randomBytes(6).toString('hex')}` };
  }
}

export const PASS_GATEWAYS = Symbol('PASS_GATEWAYS');

export function demoPaymentsEnabled() {
  return process.env.BOOKING_DEMO_PAYMENTS === 'true';
}

export function buildPassGateways(): PaymentProvider[] {
  return demoPaymentsEnabled() ? [new DemoPassGateway()] : [];
}
