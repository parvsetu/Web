import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Agent, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile, temporaryPassword } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { brandedEmail, MailService } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { dateOnly, ymd } from '../../common/time/validity';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { BillingService, rupees, toPaise } from '../billing/billing.service';
import { AgentEarningsService } from '../registrations/agent-earnings.service';
import { presentFeePayment } from '../registrations/event-fee.service';
import { RegistrationsService } from '../registrations/registrations.service';
import { AgentCtx } from './agent.guard';
import { AgentListQuery, AgentMandalQuery, AgentPayoutDto, AttributeAgentDto, CreateAgentDto, UpdateAgentDto } from './agents.dto';

type Db = Prisma.TransactionClient | PrismaService;

export function referralLink(code: string) {
  return `${siteUrl()}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * Field agents: super-admin-created accounts that register mandals (and earn a
 * referral once a mandal pays its first event fee, plus an optional % of each
 * paid fee — see AgentEarningsService). Payouts are recorded by the super
 * admin and can never exceed what is due (agent row lock).
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
    private readonly earnings: AgentEarningsService,
    private readonly registrations: RegistrationsService,
  ) {}

  private async rates(a: Agent, db: Db = this.prisma) {
    const s = await this.billing.settings(db);
    return {
      referralFee: rupees(a.referralFeePaise ?? s.agentReferralFeePaise), referralFeeCustom: a.referralFeePaise !== null,
      commissionPercent: ((a.commissionBps ?? s.agentCommissionBps) / 100).toFixed(2), commissionCustom: a.commissionBps !== null,
    };
  }

  private async stats(agentId: string) {
    const [byStatus, liveMandals, liveEvents, attributed] = await Promise.all([
      this.prisma.mandalRegistration.groupBy({ by: ['status'], where: { agentId }, _count: { _all: true } }),
      this.prisma.organization.count({ where: { agentId, events: { some: { approvalStatus: 'LIVE' } } } }),
      this.prisma.event.count({ where: { approvalStatus: 'LIVE', feeLegacy: false, organization: { agentId } } }),
      this.prisma.organization.count({ where: { agentId } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    return {
      registered: byStatus.reduce((n, b) => n + b._count._all, 0),
      pending: count('PENDING_REVIEW') + count('PENDING_VERIFICATION') + count('CHANGES_REQUESTED'),
      approved: count('APPROVED'), rejected: count('REJECTED'),
      mandals: attributed, liveMandals, liveEvents,
    };
  }

  private async money(agentId: string) {
    const t = await this.earnings.totals(agentId, this.prisma);
    return { earned: rupees(t.earnedPaise), reversed: rupees(t.reversedPaise), paid: rupees(t.paidPaise), due: rupees(t.duePaise) };
  }

  private presentAgent(a: Agent & { users?: { id: string; email: string | null; mobile: string }[] }) {
    return {
      id: a.id, name: a.name, phone: a.phone, email: a.email, code: a.code, status: a.status, createdAt: a.createdAt,
      referralLink: referralLink(a.code), userId: a.users?.[0]?.id ?? null,
    };
  }

  // ─── Agent portal ──────────────────────────────────────────────────

  async overview(ctx: AgentCtx) {
    const a = await this.prisma.agent.findUniqueOrThrow({ where: { id: ctx.id } });
    return { agent: this.presentAgent(a), rates: await this.rates(a), stats: await this.stats(a.id), earnings: await this.money(a.id) };
  }

  /** The agent's registrations (with live/fee status once approved) + mandals attributed to it directly. */
  async mandals(ctx: AgentCtx, q: AgentMandalQuery) {
    const regs = await this.registrations.list(q, { agentId: ctx.id });
    const attributed = await this.prisma.organization.findMany({
      where: { agentId: ctx.id, OR: [{ registration: null }, { registration: { agentId: { not: ctx.id } } }] },
      select: {
        id: true, name: true, city: true, state: true, agentAttributedAt: true,
        events: { where: { feeLegacy: false }, orderBy: { startDate: 'asc' }, take: 20, include: { feePayments: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      },
      orderBy: { name: 'asc' }, take: 100,
    });
    return {
      ...regs,
      attributed: attributed.map((o) => ({
        id: o.id, name: o.name, city: o.city, state: o.state, attributedAt: o.agentAttributedAt,
        events: o.events.map((e) => ({ id: e.id, name: e.name, festivalType: e.festivalType, startDate: ymd(e.startDate), endDate: ymd(e.endDate), approvalStatus: e.approvalStatus, fee: e.feePaise !== null ? rupees(e.feePaise) : null, payment: e.feePayments[0] ? presentFeePayment(e.feePayments[0]) : null })),
      })),
    };
  }

  async ledger(agentId: string, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const [rows, total] = await Promise.all([
      this.prisma.agentLedgerEntry.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, skip, take, include: { organization: { select: { id: true, name: true } } } }),
      this.prisma.agentLedgerEntry.count({ where: { agentId } }),
    ]);
    const events = await this.prisma.event.findMany({ where: { id: { in: rows.map((r) => r.eventId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return paged(rows.map((r) => ({
      id: r.id, type: r.type, kind: r.kind, amount: rupees(r.amountPaise), createdAt: r.createdAt, note: r.note, reversed: !!r.reversedAt,
      organization: r.organization, event: events.find((e) => e.id === r.eventId) ?? null,
    })), total, page, pageSize);
  }

  async payouts(agentId: string, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const [rows, total] = await Promise.all([
      this.prisma.agentPayout.findMany({ where: { agentId }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.prisma.agentPayout.count({ where: { agentId } }),
    ]);
    return paged(rows.map((p) => ({ id: p.id, amount: rupees(p.amountPaise), paidOn: ymd(p.paidOn), reference: p.reference, note: p.note, createdAt: p.createdAt })), total, page, pageSize);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async list(q: AgentListQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.AgentWhereInput = {
      status: q.status,
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { code: { contains: t.toUpperCase() } }, { phone: { contains: t } }, { email: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.agent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { users: { select: { id: true, email: true, mobile: true } } } }),
      this.prisma.agent.count({ where }),
    ]);
    return paged(await Promise.all(rows.map(async (a) => ({ ...this.presentAgent(a), rates: await this.rates(a), stats: await this.stats(a.id), earnings: await this.money(a.id) }))), total, page, pageSize);
  }

  async detail(id: string) {
    const a = await this.prisma.agent.findUnique({ where: { id }, include: { users: { select: { id: true, email: true, mobile: true } } } });
    if (!a) throw new NotFoundException('Agent not found');
    const ctx = { id: a.id, name: a.name, code: a.code, status: a.status };
    return {
      agent: this.presentAgent(a), rates: await this.rates(a), stats: await this.stats(a.id), earnings: await this.money(a.id),
      mandals: await this.mandals(ctx, { pageSize: 50 }),
    };
  }

  private async uniqueCode(name: string, db: Db) {
    const letters = name.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'AGENT';
    for (let i = 0; i < 50; i++) {
      const code = `${letters}${randomInt(10, 100)}`;
      if (!(await db.agent.findUnique({ where: { code } }))) return code;
    }
    return `${letters}${randomInt(1000, 10000)}`;
  }

  /** Creates the agent + its login (one-time temporary password, emailed and shown once). */
  async create(actor: RequestUser, dto: CreateAgentDto) {
    const phone = normalizeMobile(dto.phone);
    const email = normalizeEmail(dto.email)!;
    if (await this.prisma.user.findUnique({ where: { mobile: phone } })) throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    const code = dto.code?.toUpperCase();
    if (code && (await this.prisma.agent.findUnique({ where: { code } }))) throw new ConflictException({ message: 'That referral code is taken.', code: 'CODE_TAKEN' });
    const temp = temporaryPassword();
    const hash = await bcrypt.hash(temp, BCRYPT_ROUNDS);
    const a = await this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          name: dto.name.trim(), phone, email, code: code ?? (await this.uniqueCode(dto.name, tx)), createdById: actor.id,
          referralFeePaise: dto.referralFee !== undefined ? toPaise(dto.referralFee) : null,
          commissionBps: dto.commissionPercent !== undefined ? Math.round(Number(dto.commissionPercent) * 100) : null,
        },
      });
      // Admin-created account: email counts as known, no OTP gate (like other admin-created accounts).
      await tx.user.create({ data: { name: agent.name, mobile: phone, email, passwordHash: hash, agentId: agent.id } });
      await this.audit.log({ actorId: actor.id, action: 'agent.created', entityType: 'Agent', entityId: agent.id, after: { name: agent.name, code: agent.code, phone, email } }, tx);
      return agent;
    });
    await this.mail.send({
      to: email,
      ...brandedEmail({
        subject: 'Your Parvsetu field agent account',
        title: 'Welcome to the Parvsetu field team',
        name: a.name,
        paragraphs: [
          `Your agent account is ready. Log in with your mobile number (${phone}) or this email, and this one-time password: ${temp}`,
          'Please change it after your first login (account menu → Change password).',
          `Your referral code is ${a.code}. Mandals that register with it — or that you register for them — are credited to you once they pay their first event fee.`,
        ],
        cta: { label: 'Log in', url: `${siteUrl()}/login` },
      }),
    });
    return { agent: this.presentAgent(a), temporaryPassword: temp };
  }

  async update(actor: RequestUser, id: string, dto: UpdateAgentDto) {
    const before = await this.prisma.agent.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Agent not found');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.agent.update({
        where: { id },
        data: {
          name: dto.name?.trim(), status: dto.status,
          referralFeePaise: dto.referralFee === undefined ? undefined : dto.referralFee === null ? null : toPaise(dto.referralFee),
          commissionBps: dto.commissionPercent === undefined ? undefined : dto.commissionPercent === null ? null : Math.round(Number(dto.commissionPercent) * 100),
        },
      });
      if (dto.name) await tx.user.updateMany({ where: { agentId: id }, data: { name: dto.name.trim() } });
      await this.audit.log({
        actorId: actor.id, action: 'agent.updated', entityType: 'Agent', entityId: id,
        before: { name: before.name, status: before.status, referralFeePaise: before.referralFeePaise, commissionBps: before.commissionBps },
        after: { name: after.name, status: after.status, referralFeePaise: after.referralFeePaise, commissionBps: after.commissionBps }, reason: dto.reason,
      }, tx);
      return { ...this.presentAgent(after), rates: await this.rates(after, tx) };
    });
  }

  /** Records money paid to the agent. Serialized on the agent row; never more than what is due. */
  async payout(actor: RequestUser, id: string, dto: AgentPayoutDto) {
    const amountPaise = toPaise(dto.amount);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM agents WHERE id = ${id} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Agent not found');
      const t = await this.earnings.totals(id, tx);
      if (amountPaise > t.duePaise) {
        throw new BadRequestException({ statusCode: 400, code: 'PAYOUT_EXCEEDS_DUE', message: `Only ₹${rupees(Math.max(0, t.duePaise))} is due to this agent.` });
      }
      const p = await tx.agentPayout.create({ data: { agentId: id, amountPaise, paidOn: dateOnly(dto.paidOn), reference: dto.reference.trim(), note: dto.note?.trim() || null, createdById: actor.id } });
      await tx.agentLedgerEntry.create({ data: { agentId: id, type: 'PAID', kind: 'PAYOUT', amountPaise, payoutId: p.id, note: dto.reference.trim(), createdById: actor.id } });
      await this.audit.log({ actorId: actor.id, action: 'agent.payout_recorded', entityType: 'AgentPayout', entityId: p.id, after: { agentId: id, amount: rupees(amountPaise), paidOn: dto.paidOn, reference: dto.reference } }, tx);
    });
    return { earnings: await this.money(id), payouts: await this.payouts(id, {}) };
  }

  /** Credits an existing mandal to an agent (or removes the credit). Future fees earn; past ones don't. */
  async attribute(actor: RequestUser, orgId: string, dto: AttributeAgentDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, agentId: true } });
    if (!org) throw new NotFoundException('Mandal not found');
    if (dto.agentId && !(await this.prisma.agent.findUnique({ where: { id: dto.agentId }, select: { id: true } }))) throw new NotFoundException('Agent not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: orgId }, data: { agentId: dto.agentId, agentAttributedAt: dto.agentId ? new Date() : null } });
      await this.audit.log({ organizationId: orgId, actorId: actor.id, action: 'organization.agent_attributed', entityType: 'Organization', entityId: orgId, before: { agentId: org.agentId }, after: { agentId: dto.agentId }, reason: dto.reason }, tx);
    });
    return { organizationId: orgId, agentId: dto.agentId };
  }
}
