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
  const admin = await makeUser(prisma, { name: `Admin ${tag}` });
  await prisma.organizationMember.create({ data: { organizationId: org.id, userId: admin.id, roleId: await systemRoleId(prisma, 'MANDAL_ADMIN') } });
  return { org, event, admin };
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
