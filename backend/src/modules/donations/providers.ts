import { UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { CreatePaymentInput, CreatePaymentResult, PaymentProvider, WebhookResult } from './payment-provider';

/** Money already received (cash, UPI to the mandal's own account, cheque). */
export class ManualPaymentProvider implements PaymentProvider {
  readonly key = 'manual';
  readonly label = 'Cash / received directly';
  readonly online = false;

  async createPayment(): Promise<CreatePaymentResult> {
    return { status: 'SUCCESS', providerOrderId: null };
  }
}

/**
 * Local stand-in for an online gateway so the PENDING → webhook → SUCCESS
 * flow can be exercised end-to-end. Enabled only when PAYMENTS_MOCK_ENABLED
 * is "true"; signs webhooks with HMAC-SHA256 over the raw body, the same
 * shape real gateways use.
 */
export class MockGatewayProvider implements PaymentProvider {
  readonly key = 'mock';
  readonly label = 'Mock online gateway (development only)';
  readonly online = true;

  constructor(private readonly secret: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerOrderId = `mock_${randomBytes(8).toString('hex')}`;
    return {
      status: 'PENDING',
      providerOrderId,
      checkoutUrl: `https://mock-gateway.invalid/pay/${providerOrderId}?amount=${input.amount}`,
    };
  }

  sign(rawBody: Buffer | string) {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  async parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<WebhookResult> {
    const given = String(headers['x-mock-signature'] ?? '');
    const expected = this.sign(rawBody);
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const body = JSON.parse(rawBody.toString('utf8'));
    const status = body.status === 'paid' ? 'SUCCESS' : body.status === 'failed' ? 'FAILED' : body.status === 'refunded' ? 'REFUNDED' : null;
    if (!status || typeof body.orderId !== 'string') throw new UnauthorizedException('Malformed webhook');
    return { providerOrderId: body.orderId, status, paymentReference: typeof body.paymentId === 'string' ? body.paymentId : undefined };
  }
}

export function buildProviders(): PaymentProvider[] {
  const list: PaymentProvider[] = [new ManualPaymentProvider()];
  if (process.env.PAYMENTS_MOCK_ENABLED === 'true' && process.env.PAYMENTS_MOCK_SECRET) {
    list.push(new MockGatewayProvider(process.env.PAYMENTS_MOCK_SECRET));
  }
  return list;
}
