import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient, TokenStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { QrSigner } from '../src/common/qr/qr-signer';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  url: string;
  jwt: JwtService;
  qr: QrSigner;
}

export async function bootApp(): Promise<TestCtx> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.listen(0);
  const url = (await app.getUrl()).replace('[::1]', 'localhost');
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(url),
    url,
    jwt: app.get(JwtService),
    qr: app.get(QrSigner),
  };
}

const PASSWORD_HASH = bcrypt.hashSync('Password@123', 4);
let mobileCounter = 0;

export function uniqueMobile() {
  mobileCounter++;
  return `9${String(Date.now()).slice(-6)}${String(mobileCounter).padStart(3, '0')}`.slice(0, 10);
}

export async function makeUser(prisma: PrismaClient, opts: { name?: string; isSuperAdmin?: boolean } = {}) {
  const tag = randomBytes(4).toString('hex');
  return prisma.user.create({
    data: {
      name: opts.name ?? `User ${tag}`,
      mobile: `8${randomBytes(5).readUIntBE(0, 5).toString().padStart(9, '0').slice(0, 9)}`,
      email: `${tag}@test.dev`,
      passwordHash: PASSWORD_HASH,
      isSuperAdmin: opts.isSuperAdmin ?? false,
    },
  });
}

export function bearer(ctx: TestCtx, user: { id: string; tokenVersion: number }) {
  return `Bearer ${ctx.jwt.sign({ sub: user.id, ver: user.tokenVersion })}`;
}

export async function systemRoleId(prisma: PrismaClient, key: string) {
  return (await prisma.role.findFirstOrThrow({ where: { organizationId: null, key } })).id;
}

/** An org with an ACTIVE event spanning yesterday..+5 days, plus a Mandal Admin. */
export async function makeOrgWithEvent(prisma: PrismaClient, opts: { prefix?: string; status?: 'ACTIVE' | 'DRAFT' | 'COMPLETED' } = {}) {
  const tag = randomBytes(4).toString('hex');
  const org = await prisma.organization.create({ data: { name: `Mandal ${tag}`, slug: `mandal-${tag}` } });
  const today = new Date();
  const day = (offset: number) => new Date(`${new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const event = await prisma.event.create({
    data: {
      organizationId: org.id, name: `Festival ${tag}`, festivalType: 'DURGA_PUJA', startDate: day(-1), endDate: day(5),
      timezone: 'Asia/Kolkata', status: opts.status ?? 'ACTIVE', tokenPrefix: opts.prefix ?? 'TST', maxVisitorsPerToken: 10,
    },
  });
  // Plenty of prepaid token credit so unrelated tests never hit the limit.
  await prisma.orgBilling.create({ data: { organizationId: org.id, creditBalancePaise: 1_000_000_000 } });
  const admin = await makeUser(prisma, { name: `Admin ${tag}` });
  await prisma.organizationMember.create({ data: { organizationId: org.id, userId: admin.id, roleId: await systemRoleId(prisma, 'MANDAL_ADMIN') } });
  return { org, event, admin };
}

/** A VERIFIED payout account so the mandal can take online payments. */
export async function verifyPayouts(prisma: PrismaClient, organizationId: string, submittedById: string) {
  const { encryptField } = await import('../src/common/crypto/field-crypto');
  return prisma.payoutAccount.create({ data: {
    organizationId, entityType: 'UNREGISTERED', legalName: 'Test Mandal', addressLine: 'Main road', city: 'Pune', state: 'Maharashtra', pincode: '411001',
    contactName: 'Test', contactRole: 'Treasurer', contactPhone: '9876543210', contactEmail: 't@test.dev',
    signatoryPanEnc: encryptField('ABCDE1234F'), signatoryPanLast4: '234F', bankHolderName: 'Test', bankAccountEnc: encryptField('123456789012'),
    bankAccountLast4: '9012', ifsc: 'SBIN0001234', accountType: 'SAVINGS', status: 'VERIFIED', consentAt: new Date(), submittedById,
  } });
}

export async function assign(prisma: PrismaClient, eventId: string, userId: string, roleKey: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  return prisma.eventAssignment.create({ data: { eventId, userId, roleId: await systemRoleId(prisma, roleKey), status } });
}

export async function makeVolunteer(prisma: PrismaClient, eventId: string, roleKey = 'VOLUNTEER', name?: string) {
  const user = await makeUser(prisma, { name });
  await assign(prisma, eventId, user.id, roleKey);
  return user;
}

let codeCounter = 0;

/** Inserts a token directly (lets tests create past/future windows) and returns its QR payload. */
export async function makeToken(
  ctx: TestCtx,
  eventId: string,
  opts: { validFrom?: Date; validUntil?: Date; status?: TokenStatus; extra?: Partial<Prisma.TokenUncheckedCreateInput> } = {},
) {
  codeCounter++;
  const now = Date.now();
  const status = opts.status ?? 'ACTIVE';
  const token = await ctx.prisma.token.create({
    data: {
      id: randomUUID(),
      eventId,
      tokenCode: `TST-2026-${String(900000 + codeCounter)}`,
      secureToken: ctx.qr.newSecureToken(),
      validFrom: opts.validFrom ?? new Date(now - 3600_000),
      validUntil: opts.validUntil ?? new Date(now + 3600_000),
      status,
      cancelledAt: status === 'CANCELLED' ? new Date() : null,
      usedAt: status === 'USED' ? new Date() : null,
      ...opts.extra,
    },
  });
  return { token, qrPayload: ctx.qr.payloadFor(token.secureToken) };
}

export function scan(ctx: TestCtx, auth: string, body: Record<string, unknown>) {
  return ctx.http().post('/api/v1/tokens/scan').set('Authorization', auth).send(body);
}

export const idem = () => randomUUID();

/** Header-valid PNG (signature + IHDR) padded to `size` bytes — enough for the server's sniffer. */
export function fakePng(width = 800, height = 600, size = 2048) {
  const b = Buffer.alloc(Math.max(size, 33));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

export function fakeJpeg(width = 1920, height = 1080, size = 4096) {
  const b = Buffer.alloc(size);
  // SOI, APP0 (len 16), SOF0 (len 17) with height/width.
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).copy(b, 0);
  b.write('JFIF', 6, 'ascii');
  const sof = 2 + 2 + 16;
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]).copy(b, sof);
  b.writeUInt16BE(height, sof + 5);
  b.writeUInt16BE(width, sof + 7);
  return b;
}
