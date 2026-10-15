import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Blogger, BloggerPromotion, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, searchTerm, toCsv } from '../../common/http';
import { brandedEmail, MailService } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { LIVE_WHERE } from '../../common/event-approval';
import { dateOnly, dayRange, todayIn, ymd } from '../../common/time/validity';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { OtpService, maskEmail } from '../auth/otp.service';
import { rupees, toPaise } from '../billing/billing.service';
import { BloggerCtx } from './blogger.guard';
import { ReferralEarningsService } from './referral-earnings.service';
import { CommissionMode, commissionValue, normalizeCode, presentCommission } from './referral-rules';
import {
  BloggerListQuery, BloggerPayoutDto, BloggerSignupDto, BloggerStatusDto, PERCENT, PromotionCommissionDto, PromotionListQuery,
  ReferralReportQuery, ReviewPromotionDto, RUPEES, UpdateBloggerProfileDto,
} from './referrals.dto';

type Db = Prisma.TransactionClient | PrismaService;
const IST = 'Asia/Kolkata';

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.replace(/\s+/g, ' ').trim() || null);
const handle = (v: string | undefined) => (v === undefined ? undefined : v.trim() ? `@${v.trim().replace(/^@/, '')}` : null);

export function referralLink(eventId: string, code: string) {
  return `${siteUrl()}/f/${eventId}?ref=${encodeURIComponent(code)}`;
}

export function presentBlogger(b: Blogger) {
  return {
    id: b.id, name: b.name, email: b.email, phone: b.phone, city: b.city, bio: b.bio,
    youtubeUrl: b.youtubeUrl, instagramHandle: b.instagramHandle, blogUrl: b.blogUrl, audience: b.audience,
    status: b.status, reviewNote: b.reviewNote, reviewedAt: b.reviewedAt, createdAt: b.createdAt,
  };
}

const EVENT_SELECT = {
  id: true, name: true, festivalType: true, startDate: true, endDate: true, city: true, state: true, status: true, approvalStatus: true, publicBookingEnabled: true,
  organization: { select: { id: true, name: true } },
} as const;

type PromotionRow = BloggerPromotion & { event: Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }> };

/**
 * Blogger / influencer accounts and their festival promotions.
 *
 * A blogger signs up with their channels and the festivals they want to
 * promote (email OTP, like vendors), then waits for the super admin. The
 * blogger and each promotion are approved separately; approving a promotion
 * assigns its referral code. Money lives in ReferralEarningsService.
 */
@Injectable()
export class BloggersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly earnings: ReferralEarningsService,
  ) {}

  // ─── Signup & portal ───────────────────────────────────────────────

  /** A festival a blogger may promote: platform-LIVE, not cancelled/completed, not over. */
  private async promotableEvent(db: Db, eventId: string) {
    const e = await db.event.findFirst({
      where: { id: eventId, ...LIVE_WHERE, status: { notIn: ['CANCELLED', 'COMPLETED'] }, endDate: { gte: dateOnly(todayIn(IST)) } },
      select: { id: true, organizationId: true, name: true },
    });
    if (!e) throw new BadRequestException({ statusCode: 400, code: 'EVENT_NOT_PROMOTABLE', message: 'That festival is not open for promotion (not live, or already over).' });
    return e;
  }

  async signup(dto: BloggerSignupDto) {
    if (!dto.youtubeUrl && !dto.instagramHandle && !dto.blogUrl) {
      throw new BadRequestException({ statusCode: 400, code: 'CHANNEL_REQUIRED', message: 'Add at least one channel — YouTube, Instagram or a blog.' });
    }
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email)!;
    if (await this.prisma.user.findUnique({ where: { mobile } })) throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    const events = await Promise.all(dto.eventIds.map((id) => this.promotableEvent(this.prisma, id)));
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const b = await tx.blogger.create({
        data: {
          name: clean(dto.name)!, email, phone: mobile, city: clean(dto.city) ?? null, bio: dto.bio?.trim() || null,
          youtubeUrl: dto.youtubeUrl || null, instagramHandle: handle(dto.instagramHandle) ?? null, blogUrl: dto.blogUrl || null, audience: clean(dto.audience) ?? null,
        },
      });
      for (const e of events) await tx.bloggerPromotion.create({ data: { bloggerId: b.id, eventId: e.id, organizationId: e.organizationId } });
      // Locked until the emailed code is entered (same flow as vendor / partner signup).
      const u = await tx.user.create({ data: { name: b.name, mobile, email, passwordHash, requiresEmailVerification: true, bloggerId: b.id } });
      await this.audit.log({ actorId: u.id, action: 'blogger.signed_up', entityType: 'Blogger', entityId: b.id, after: { name: b.name, email, events: events.map((e) => e.id) } }, tx);
      return u;
    });
    try {
      await this.otp.issue({ id: user.id, name: user.name, email }, 'VERIFY_EMAIL');
    } catch (e) {
      if (!(e instanceof HttpException && e.getStatus() === 429)) throw e;
    }
    return { verificationRequired: true, email, maskedEmail: maskEmail(email) };
  }

  private async money(bloggerId: string, db: Db = this.prisma) {
    const t = await this.earnings.totals(bloggerId, db);
    return { earned: rupees(t.earnedPaise), reversed: rupees(t.reversedPaise), paid: rupees(t.paidPaise), due: rupees(t.duePaise) };
  }

  private async defaultTerms() {
    const t = await this.earnings.terms(this.prisma, { commissionMode: null, commissionValue: null });
    return presentCommission(t.mode, t.value);
  }

  /** Paid bookings, visitors, gross and commission per promotion. */
  private async promotionStats(ids: string[], range?: { gte: Date; lt: Date }) {
    if (!ids.length) return new Map<string, ReturnType<typeof emptyStats>>();
    const [all, paid, ledger] = await Promise.all([
      this.prisma.passOrder.groupBy({ by: ['referralPromotionId'], where: { referralPromotionId: { in: ids }, createdAt: range }, _count: { _all: true } }),
      this.prisma.passOrder.groupBy({ by: ['referralPromotionId'], where: { referralPromotionId: { in: ids }, status: 'PAID', paidAt: range }, _count: { _all: true }, _sum: { amount: true, baseAmount: true, visitorCount: true } }),
      this.prisma.referralLedgerEntry.groupBy({ by: ['promotionId', 'type'], where: { promotionId: { in: ids }, kind: 'COMMISSION', createdAt: range }, _sum: { amountPaise: true } }),
    ]);
    const out = new Map<string, ReturnType<typeof emptyStats>>();
    for (const id of ids) {
      const s = emptyStats();
      s.referrals = all.find((x) => x.referralPromotionId === id)?._count._all ?? 0;
      const p = paid.find((x) => x.referralPromotionId === id);
      s.paidBookings = p?._count._all ?? 0;
      s.visitors = p?._sum.visitorCount ?? 0;
      s.gross = (p?._sum.amount ?? new Prisma.Decimal(0)).toFixed(2);
      s.ticketValue = (p?._sum.baseAmount ?? new Prisma.Decimal(0)).toFixed(2);
      const earned = ledger.find((x) => x.promotionId === id && x.type === 'EARNED')?._sum.amountPaise ?? 0;
      const reversed = ledger.find((x) => x.promotionId === id && x.type === 'REVERSED')?._sum.amountPaise ?? 0;
      s.commissionEarned = rupees(earned);
      s.commissionReversed = rupees(reversed);
      s.commissionNet = rupees(earned - reversed);
      out.set(id, s);
    }
    return out;
  }

  private async presentPromotions(rows: PromotionRow[]) {
    const stats = await this.promotionStats(rows.map((r) => r.id));
    return Promise.all(rows.map(async (p) => {
      const t = await this.earnings.terms(this.prisma, p);
      return {
        id: p.id, status: p.status, code: p.code, link: p.code && p.status === 'APPROVED' ? referralLink(p.eventId, p.code) : null,
        reviewNote: p.reviewNote, reviewedAt: p.reviewedAt, createdAt: p.createdAt,
        commission: presentCommission(t.mode, t.value, t.custom),
        event: {
          id: p.event.id, name: p.event.name, festivalType: p.event.festivalType, startDate: ymd(p.event.startDate), endDate: ymd(p.event.endDate),
          city: p.event.city, state: p.event.state, status: p.event.status, publicBookingEnabled: p.event.publicBookingEnabled,
          organization: p.event.organization,
        },
        stats: stats.get(p.id)!,
      };
    }));
  }

  async overview(ctx: BloggerCtx) {
    const b = await this.prisma.blogger.findUniqueOrThrow({ where: { id: ctx.id } });
    const byStatus = await this.prisma.bloggerPromotion.groupBy({ by: ['status'], where: { bloggerId: b.id }, _count: { _all: true } });
    const count = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const ids = (await this.prisma.bloggerPromotion.findMany({ where: { bloggerId: b.id }, select: { id: true } })).map((p) => p.id);
    const stats = [...(await this.promotionStats(ids)).values()];
    return {
      blogger: presentBlogger(b), defaultCommission: await this.defaultTerms(), earnings: await this.money(b.id),
      stats: {
        approved: count('APPROVED'), pending: count('PENDING'), rejected: count('REJECTED') + count('REVOKED'),
        referrals: stats.reduce((n, s) => n + s.referrals, 0), paidBookings: stats.reduce((n, s) => n + s.paidBookings, 0),
        visitors: stats.reduce((n, s) => n + s.visitors, 0),
      },
    };
  }

  async updateProfile(actor: RequestUser, ctx: BloggerCtx, dto: UpdateBloggerProfileDto) {
    const before = await this.prisma.blogger.findUniqueOrThrow({ where: { id: ctx.id } });
    const data: Prisma.BloggerUpdateInput = {
      name: dto.name === undefined ? undefined : clean(dto.name)!, phone: dto.phone === undefined ? undefined : normalizeMobile(dto.phone),
      city: clean(dto.city), bio: dto.bio === undefined ? undefined : dto.bio.trim() || null, audience: clean(dto.audience),
      youtubeUrl: dto.youtubeUrl === undefined ? undefined : dto.youtubeUrl || null, blogUrl: dto.blogUrl === undefined ? undefined : dto.blogUrl || null,
      instagramHandle: handle(dto.instagramHandle),
    };
    const after = await this.prisma.$transaction(async (tx) => {
      const b = await tx.blogger.update({ where: { id: ctx.id }, data });
      if (!b.youtubeUrl && !b.instagramHandle && !b.blogUrl) {
        throw new BadRequestException({ statusCode: 400, code: 'CHANNEL_REQUIRED', message: 'Keep at least one channel — YouTube, Instagram or a blog.' });
      }
      if (dto.name) await tx.user.updateMany({ where: { bloggerId: b.id }, data: { name: b.name } });
      await this.audit.log({ actorId: actor.id, action: 'blogger.profile_updated', entityType: 'Blogger', entityId: b.id, before: presentBlogger(before), after: presentBlogger(b) }, tx);
      return b;
    });
    return presentBlogger(after);
  }

  async myPromotions(ctx: BloggerCtx) {
    const rows = await this.prisma.bloggerPromotion.findMany({ where: { bloggerId: ctx.id }, include: { event: { select: EVENT_SELECT } }, orderBy: [{ createdAt: 'desc' }] });
    return this.presentPromotions(rows);
  }

  /** Asks to promote one more festival. A rejected/revoked request can be asked again (back to PENDING). */
  async requestPromotion(actor: RequestUser, ctx: BloggerCtx, eventId: string) {
    const e = await this.promotableEvent(this.prisma, eventId);
    const existing = await this.prisma.bloggerPromotion.findUnique({ where: { bloggerId_eventId: { bloggerId: ctx.id, eventId } } });
    if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) {
      throw new ConflictException({ statusCode: 409, code: 'ALREADY_REQUESTED', message: existing.status === 'APPROVED' ? 'You already promote this festival.' : 'You have already asked to promote this festival.' });
    }
    if ((await this.prisma.bloggerPromotion.count({ where: { bloggerId: ctx.id, status: 'PENDING' } })) >= 10) {
      throw new ConflictException({ statusCode: 409, code: 'TOO_MANY_PENDING', message: 'You have 10 requests waiting for review. Wait for those first.' });
    }
    await this.prisma.$transaction(async (tx) => {
      const p = existing
        // A pending row can't hold a code (CHECK): asking again after a revoke means a new code on approval.
        // (The super admin can re-approve a revoked promotion directly to keep its old code.)
        ? await tx.bloggerPromotion.update({ where: { id: existing.id }, data: { status: 'PENDING', code: null, reviewNote: null, reviewedAt: null, reviewedById: null } })
        : await tx.bloggerPromotion.create({ data: { bloggerId: ctx.id, eventId: e.id, organizationId: e.organizationId } });
      await this.audit.log({ actorId: actor.id, eventId: e.id, organizationId: e.organizationId, action: 'blogger_promotion.requested', entityType: 'BloggerPromotion', entityId: p.id }, tx);
    });
    return this.myPromotions(ctx);
  }

  async ledger(bloggerId: string, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const [rows, total] = await Promise.all([
      this.prisma.referralLedgerEntry.findMany({ where: { bloggerId }, orderBy: { createdAt: 'desc' }, skip, take, include: { promotion: { select: { code: true } } } }),
      this.prisma.referralLedgerEntry.count({ where: { bloggerId } }),
    ]);
    const events = await this.prisma.event.findMany({ where: { id: { in: rows.map((r) => r.eventId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    const orders = await this.prisma.passOrder.findMany({ where: { id: { in: rows.map((r) => r.passOrderId).filter(Boolean) as string[] } }, select: { id: true, invoiceNo: true, visitorCount: true } });
    return paged(rows.map((r) => {
      const o = orders.find((x) => x.id === r.passOrderId);
      return {
        id: r.id, type: r.type, kind: r.kind, amount: rupees(r.amountPaise), createdAt: r.createdAt, note: r.note, reversed: !!r.reversedAt,
        code: r.promotion?.code ?? null, event: events.find((e) => e.id === r.eventId) ?? null,
        // Buyers' names never reach the blogger — only the booking's invoice number and size.
        booking: o ? { invoiceNo: o.invoiceNo, visitors: o.visitorCount } : null,
      };
    }), total, page, pageSize);
  }

  async payouts(bloggerId: string, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const [rows, total] = await Promise.all([
      this.prisma.bloggerPayout.findMany({ where: { bloggerId }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.prisma.bloggerPayout.count({ where: { bloggerId } }),
    ]);
    return paged(rows.map((p) => ({ id: p.id, amount: rupees(p.amountPaise), paidOn: ymd(p.paidOn), reference: p.reference, note: p.note, createdAt: p.createdAt })), total, page, pageSize);
  }

  // ─── Public ────────────────────────────────────────────────────────

  /** Booking page: is this code valid for this festival? (Who referred you — never earnings.) */
  async checkCode(eventId: string, raw: string) {
    const p = await this.prisma.bloggerPromotion.findUnique({ where: { code: normalizeCode(raw) }, select: { eventId: true, status: true, code: true, blogger: { select: { name: true, status: true } } } });
    if (!p || p.eventId !== eventId || p.status !== 'APPROVED' || p.blogger.status !== 'ACTIVE') {
      throw new NotFoundException({ statusCode: 404, code: 'REFERRAL_CODE_INVALID', message: 'This referral code is not valid for this festival.' });
    }
    return { code: p.code, bloggerName: p.blogger.name };
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async list(q: BloggerListQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.BloggerWhereInput = {
      status: q.status,
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { email: { contains: t, mode: 'insensitive' } }, { phone: { contains: t } }, { instagramHandle: { contains: t, mode: 'insensitive' } }, { city: { contains: t, mode: 'insensitive' } }, { promotions: { some: { code: { contains: t.toUpperCase() } } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogger.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take, include: { promotions: { select: { status: true } } } }),
      this.prisma.blogger.count({ where }),
    ]);
    return paged(await Promise.all(rows.map(async ({ promotions, ...b }) => ({
      ...presentBlogger(b),
      promotions: { approved: promotions.filter((p) => p.status === 'APPROVED').length, pending: promotions.filter((p) => p.status === 'PENDING').length, total: promotions.length },
      earnings: await this.money(b.id),
    }))), total, page, pageSize);
  }

  async detail(id: string) {
    const b = await this.prisma.blogger.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Blogger not found');
    const rows = await this.prisma.bloggerPromotion.findMany({ where: { bloggerId: id }, include: { event: { select: EVENT_SELECT } }, orderBy: [{ createdAt: 'desc' }] });
    return { blogger: presentBlogger(b), earnings: await this.money(id), defaultCommission: await this.defaultTerms(), promotions: await this.presentPromotions(rows) };
  }

  /** Promotion requests across bloggers (the review queue). */
  async promotions(q: PromotionListQuery) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const t = searchTerm(q.q);
    const where: Prisma.BloggerPromotionWhereInput = {
      status: q.status,
      ...(t ? { OR: [{ code: { contains: t.toUpperCase() } }, { blogger: { name: { contains: t, mode: 'insensitive' } } }, { event: { name: { contains: t, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bloggerPromotion.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take, include: { event: { select: EVENT_SELECT }, blogger: true } }),
      this.prisma.bloggerPromotion.count({ where }),
    ]);
    const presented = await this.presentPromotions(rows);
    return paged(presented.map((p, i) => ({ ...p, blogger: { id: rows[i].blogger.id, name: rows[i].blogger.name, status: rows[i].blogger.status, instagramHandle: rows[i].blogger.instagramHandle, youtubeUrl: rows[i].blogger.youtubeUrl, blogUrl: rows[i].blogger.blogUrl } })), total, page, pageSize);
  }

  async setStatus(actor: RequestUser, id: string, dto: BloggerStatusDto) {
    const before = await this.prisma.blogger.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Blogger not found');
    if (before.status === dto.status) return presentBlogger(before);
    if (dto.status === 'REJECTED' && before.status !== 'PENDING') {
      throw new ConflictException({ statusCode: 409, code: 'BLOGGER_NOT_PENDING', message: 'Only a pending blogger can be rejected — suspend an approved one instead.' });
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const b = await tx.blogger.update({ where: { id }, data: { status: dto.status, reviewNote: dto.note?.trim() || null, reviewedAt: new Date(), reviewedById: actor.id } });
      // A rejected applicant's open requests are closed with it.
      if (dto.status === 'REJECTED') await tx.bloggerPromotion.updateMany({ where: { bloggerId: id, status: 'PENDING' }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: actor.id, reviewNote: 'Blogger application not approved' } });
      await this.audit.log({ actorId: actor.id, action: 'blogger.status_changed', entityType: 'Blogger', entityId: id, before: { status: before.status }, after: { status: dto.status }, reason: dto.note }, tx);
      return b;
    });
    const msg = {
      ACTIVE: before.status === 'PENDING'
        ? ['Your blogger account is approved. Each festival you asked to promote is reviewed on its own — once one is approved you get its referral link in your dashboard.']
        : ['Your blogger account is active again. Your approved referral links earn commission again.'],
      REJECTED: ['We could not approve your blogger account this time.', ...(dto.note ? [`Note from the Parvsetu team: ${dto.note}`] : [])],
      SUSPENDED: ['Your blogger account is suspended. Your referral links stop earning commission until it is re-activated.', ...(dto.note ? [`Note: ${dto.note}`] : [])],
    }[dto.status];
    await this.mail.send({ to: after.email, ...brandedEmail({ subject: `Your Parvsetu blogger account: ${dto.status === 'ACTIVE' ? 'approved' : dto.status.toLowerCase()}`, title: 'Blogger account update', name: after.name, paragraphs: msg, cta: { label: 'Open your dashboard', url: `${siteUrl()}/blogger` } }) });
    return presentBlogger(after);
  }

  /** Validates a commission override; DEFAULT/absent → null (platform default). */
  private parseCommission(mode: 'DEFAULT' | 'PERCENT' | 'FIXED' | undefined, raw: string | undefined): { commissionMode: CommissionMode | null; commissionValue: number | null } | undefined {
    if (mode === undefined) return undefined;
    if (mode === 'DEFAULT') return { commissionMode: null, commissionValue: null };
    const ok = mode === 'PERCENT' ? PERCENT.test(raw ?? '') : RUPEES.test(raw ?? '');
    if (!ok) throw new BadRequestException({ statusCode: 400, code: 'BAD_COMMISSION', message: mode === 'PERCENT' ? 'Enter the commission as a % between 0 and 100.' : 'Enter the commission as an amount like 25.' });
    return { commissionMode: mode, commissionValue: mode === 'PERCENT' ? commissionValue(raw!) : toPaise(raw!) };
  }

  private async uniqueCode(db: Db, name: string, eventId: string) {
    const ev = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { tokenPrefix: true } });
    const who = name.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'FRIEND';
    const what = ev.tokenPrefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
    for (let i = 0; i < 50; i++) {
      const code = `${who}${what}${randomInt(10, i < 25 ? 100 : 1000)}`;
      if (!(await db.bloggerPromotion.findUnique({ where: { code } }))) return code;
    }
    throw new ConflictException({ statusCode: 409, code: 'CODE_GENERATION_FAILED', message: 'Could not generate a free code — enter one.' });
  }

  async reviewPromotion(actor: RequestUser, id: string, dto: ReviewPromotionDto) {
    const before = await this.prisma.bloggerPromotion.findUnique({ where: { id }, include: { blogger: true, event: { select: { id: true, name: true, organizationId: true } } } });
    if (!before) throw new NotFoundException('Promotion not found');
    const commission = this.parseCommission(dto.commissionMode, dto.commissionValue);
    const from: Record<typeof dto.decision, string[]> = { APPROVE: ['PENDING', 'REJECTED', 'REVOKED'], REJECT: ['PENDING'], REVOKE: ['APPROVED'] };
    if (!from[dto.decision].includes(before.status)) {
      throw new ConflictException({ statusCode: 409, code: 'PROMOTION_STATE', message: `A ${before.status.toLowerCase()} promotion cannot be ${dto.decision === 'APPROVE' ? 'approved' : dto.decision === 'REJECT' ? 'rejected' : 'revoked'}.` });
    }
    if (dto.decision === 'APPROVE') {
      if (before.blogger.status !== 'ACTIVE') throw new ConflictException({ statusCode: 409, code: 'BLOGGER_NOT_ACTIVE', message: 'Approve the blogger account first.' });
      await this.promotableEvent(this.prisma, before.eventId);
    }
    const custom = dto.code ? normalizeCode(dto.code) : null;
    if (custom) {
      const taken = await this.prisma.bloggerPromotion.findUnique({ where: { code: custom }, select: { id: true } });
      if (taken && taken.id !== id) throw new ConflictException({ statusCode: 409, code: 'CODE_TAKEN', message: 'That referral code is taken.' });
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const status = dto.decision === 'APPROVE' ? 'APPROVED' : dto.decision === 'REJECT' ? 'REJECTED' : 'REVOKED';
      // Re-approval keeps the old code, so links already shared keep working.
      const code = dto.decision === 'APPROVE' ? custom ?? before.code ?? (await this.uniqueCode(tx, before.blogger.name, before.eventId)) : dto.decision === 'REVOKE' ? before.code : null;
      const moved = await tx.bloggerPromotion.updateMany({
        where: { id, status: before.status },
        data: { status, code, reviewNote: dto.note?.trim() || null, reviewedAt: new Date(), reviewedById: actor.id, ...(commission ?? {}) },
      });
      if (moved.count !== 1) throw new ConflictException({ statusCode: 409, code: 'PROMOTION_STATE', message: 'This promotion was changed by someone else. Reload and try again.' });
      await this.audit.log({
        actorId: actor.id, organizationId: before.event.organizationId, eventId: before.eventId, action: `blogger_promotion.${status.toLowerCase()}`, entityType: 'BloggerPromotion', entityId: id,
        before: { status: before.status, code: before.code, commissionMode: before.commissionMode, commissionValue: before.commissionValue },
        after: { status, code, ...(commission ?? {}) }, reason: dto.note,
      }, tx);
      return tx.bloggerPromotion.findUniqueOrThrow({ where: { id }, include: { event: { select: EVENT_SELECT } } });
    });
    const [p] = await this.presentPromotions([after]);
    const paragraphs = dto.decision === 'APPROVE'
      ? [`You can now promote ${before.event.name}. Your referral code is ${p.code}.`, `Share this link: ${p.link}`, `You earn ${p.commission.label} for every booking paid through it. Cancelled bookings are reversed.`]
      : dto.decision === 'REJECT'
        ? [`Your request to promote ${before.event.name} was not approved.`, ...(dto.note ? [`Note: ${dto.note}`] : [])]
        : [`Your referral link for ${before.event.name} has been switched off and no longer earns commission.`, ...(dto.note ? [`Note: ${dto.note}`] : [])];
    await this.mail.send({ to: before.blogger.email, ...brandedEmail({ subject: `${before.event.name}: promotion ${p.status.toLowerCase()}`, title: 'Festival promotion update', name: before.blogger.name, paragraphs, cta: { label: 'Open your dashboard', url: `${siteUrl()}/blogger` } }) });
    return p;
  }

  async setCommission(actor: RequestUser, id: string, dto: PromotionCommissionDto) {
    const before = await this.prisma.bloggerPromotion.findUnique({ where: { id }, include: { event: { select: EVENT_SELECT } } });
    if (!before) throw new NotFoundException('Promotion not found');
    const c = this.parseCommission(dto.commissionMode, dto.commissionValue)!;
    const after = await this.prisma.$transaction(async (tx) => {
      const p = await tx.bloggerPromotion.update({ where: { id }, data: c, include: { event: { select: EVENT_SELECT } } });
      await this.audit.log({ actorId: actor.id, organizationId: before.organizationId, eventId: before.eventId, action: 'blogger_promotion.commission_changed', entityType: 'BloggerPromotion', entityId: id, before: { commissionMode: before.commissionMode, commissionValue: before.commissionValue }, after: c }, tx);
      return p;
    });
    return (await this.presentPromotions([after]))[0];
  }

  /** Records money paid to the blogger. Serialized on the blogger row; never more than what is due. */
  async payout(actor: RequestUser, id: string, dto: BloggerPayoutDto) {
    const amountPaise = toPaise(dto.amount);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM bloggers WHERE id = ${id} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Blogger not found');
      const t = await this.earnings.totals(id, tx);
      if (amountPaise > t.duePaise) {
        throw new BadRequestException({ statusCode: 400, code: 'PAYOUT_EXCEEDS_DUE', message: `Only ₹${rupees(Math.max(0, t.duePaise))} is due to this blogger.` });
      }
      const p = await tx.bloggerPayout.create({ data: { bloggerId: id, amountPaise, paidOn: dateOnly(dto.paidOn), reference: dto.reference.trim(), note: dto.note?.trim() || null, createdById: actor.id } });
      await tx.referralLedgerEntry.create({ data: { bloggerId: id, type: 'PAID', kind: 'PAYOUT', amountPaise, payoutId: p.id, note: dto.reference.trim(), createdById: actor.id } });
      await this.audit.log({ actorId: actor.id, action: 'blogger.payout_recorded', entityType: 'BloggerPayout', entityId: p.id, after: { bloggerId: id, amount: rupees(amountPaise), paidOn: dto.paidOn, reference: dto.reference } }, tx);
    });
    return { earnings: await this.money(id), payouts: await this.payouts(id, {}) };
  }

  /** Reverses one commission — e.g. a booking refunded outside Parvsetu. */
  async reverseEntry(actor: RequestUser, entryId: string, reason: string) {
    const e = await this.prisma.referralLedgerEntry.findUnique({ where: { id: entryId } });
    if (!e || e.type !== 'EARNED') throw new NotFoundException('Commission entry not found');
    const amount = await this.prisma.$transaction(async (tx) => {
      const n = await this.earnings.reverseEntry(tx, e, { note: `Reversed by Parvsetu: ${reason.trim()}`, actorId: actor.id });
      if (n) await this.audit.log({ actorId: actor.id, eventId: e.eventId, action: 'blogger.commission_reversed', entityType: 'ReferralLedgerEntry', entityId: e.id, after: { amount: rupees(n), passOrderId: e.passOrderId }, reason }, tx);
      return n;
    });
    if (!amount) throw new ConflictException({ statusCode: 409, code: 'ALREADY_REVERSED', message: 'This commission was already reversed.' });
    return { reversed: rupees(amount), earnings: await this.money(e.bloggerId) };
  }

  /** Referrals, paid bookings, payments and commission per promotion (dates in IST). */
  async report(q: ReferralReportQuery) {
    const range = q.from || q.to ? dayRange(q.from ?? q.to!, q.to ?? q.from!, IST) : undefined;
    const rows = await this.prisma.bloggerPromotion.findMany({
      where: { bloggerId: q.bloggerId, eventId: q.eventId, code: { not: null } },
      include: { blogger: { select: { id: true, name: true } }, event: { select: { id: true, name: true, organization: { select: { name: true } } } } },
      orderBy: [{ createdAt: 'asc' }],
    });
    const stats = await this.promotionStats(rows.map((r) => r.id), range);
    const items = rows.map((r) => ({
      promotionId: r.id, blogger: r.blogger.name, bloggerId: r.blogger.id, festival: r.event.name, eventId: r.event.id, mandal: r.event.organization.name,
      code: r.code!, status: r.status, ...stats.get(r.id)!,
    }));
    const sum = (k: 'referrals' | 'paidBookings' | 'visitors') => items.reduce((n, i) => n + i[k], 0);
    const money = (k: 'gross' | 'ticketValue' | 'commissionEarned' | 'commissionReversed' | 'commissionNet') => items.reduce((n, i) => n + toPaise(i[k]), 0);
    const payouts = await this.prisma.bloggerPayout.aggregate({ where: { bloggerId: q.bloggerId, paidOn: q.from || q.to ? { gte: dateOnly(q.from ?? q.to!), lte: dateOnly(q.to ?? q.from!) } : undefined }, _sum: { amountPaise: true } });
    return {
      from: q.from ?? null, to: q.to ?? null, items,
      totals: {
        referrals: sum('referrals'), paidBookings: sum('paidBookings'), visitors: sum('visitors'), gross: rupees(money('gross')), ticketValue: rupees(money('ticketValue')),
        commissionEarned: rupees(money('commissionEarned')), commissionReversed: rupees(money('commissionReversed')), commissionNet: rupees(money('commissionNet')),
        paidOut: rupees(payouts._sum.amountPaise ?? 0),
      },
    };
  }

  reportCsv(data: Awaited<ReturnType<BloggersService['report']>>) {
    return toCsv(data.items.map((i) => ({
      blogger: i.blogger, festival: i.festival, mandal: i.mandal, code: i.code, status: i.status, referrals: i.referrals, paidBookings: i.paidBookings,
      visitors: i.visitors, gross: i.gross, ticketValue: i.ticketValue, commissionEarned: i.commissionEarned, commissionReversed: i.commissionReversed, commissionNet: i.commissionNet,
    })));
  }
}

function emptyStats() {
  return { referrals: 0, paidBookings: 0, visitors: 0, gross: '0.00', ticketValue: '0.00', commissionEarned: '0.00', commissionReversed: '0.00', commissionNet: '0.00' };
}
