import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService, brandedEmail } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { PushService } from '../push/push.service';

/** One thing that newly needs a super admin. `tab` is the Platform console tab that handles it. */
export interface PlatformAlert {
  tab: 'registrations' | 'reviews' | 'reported' | 'payouts' | 'tax' | 'partners' | 'bloggers';
  title: string;
  detail: string;
  at: Date;
}

const TAB_LABEL: Record<PlatformAlert['tab'], string> = {
  registrations: 'Registrations', reviews: 'Event reviews', reported: 'Reported visitor reviews', payouts: 'Payouts & KYC',
  tax: '80G verification', partners: 'Promotional partners', bloggers: 'Bloggers',
};

/** How often submissions are checked. Every new item is announced once, within this time. */
export const ALERT_INTERVAL_MS = 2 * 60_000;

/**
 * Tells super admins when something is waiting for them — a new mandal
 * registration, a festival submitted for review, payout / 80G details to
 * verify, partner campaigns, blogger sign-ups and promotions, reported reviews.
 *
 * Instead of hooking every submit path (some run inside other modules'
 * transactions, e.g. email verification moving a registration into review),
 * a short loop looks for items that entered a queue since the last check and
 * sends ONE email + phone push per round. The round's time window is claimed
 * with a conditional update, so two API instances never announce twice, and
 * nothing is announced for a submission whose transaction rolled back.
 */
@Injectable()
export class PlatformAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PlatformAlertsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly push: PushService) {}

  /** Open counts per Platform tab (badges + "Waiting for you"). */
  async pendingCounts() {
    const [registrations, reviews, reported, payouts, tax, partners, campaigns, bloggers, promotions] = await Promise.all([
      this.prisma.mandalRegistration.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.event.count({ where: { approvalStatus: 'SUBMITTED' } }),
      this.prisma.visitorReview.count({ where: { reports: { some: { resolvedAt: null } } } }),
      this.prisma.payoutAccount.count({ where: { status: 'PENDING' } }),
      this.prisma.orgTaxProfile.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.partner.count({ where: { status: 'PENDING' } }),
      this.prisma.partnerCampaign.count({ where: { status: 'REQUESTED' } }),
      this.prisma.blogger.count({ where: { status: 'PENDING' } }),
      this.prisma.bloggerPromotion.count({ where: { status: 'PENDING' } }),
    ]);
    const counts = { registrations, reviews, reported, payouts, tax, partners: partners + campaigns, bloggers: bloggers + promotions };
    return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }

  /** Everything that entered a review queue in (since, until] and is still waiting. */
  newSince(since: Date, until: Date): Promise<PlatformAlert[]> {
    return this.collect({ gt: since, lte: until });
  }

  /** Everything still waiting, newest first — the super admin's notification bell. At most `perQueue` per queue. */
  async waiting(perQueue = 25): Promise<PlatformAlert[]> {
    return (await this.collect(undefined, perQueue)).reverse();
  }

  /** Waiting items, oldest first; `range` limits to when they entered the queue, `take` keeps the newest N per queue. */
  private async collect(range: { gt: Date; lte: Date } | undefined, take?: number): Promise<PlatformAlert[]> {
    const pg = <F extends 'submittedAt' | 'createdAt'>(field: F): { orderBy?: Record<F, 'desc'>; take?: number } =>
      take ? { orderBy: { [field]: 'desc' } as Record<F, 'desc'>, take } : {};
    const [regs, events, payouts, tax, partners, campaigns, bloggers, promotions, reports] = await Promise.all([
      this.prisma.mandalRegistration.findMany({ where: { status: 'PENDING_REVIEW', submittedAt: range }, ...pg('submittedAt'), select: { orgName: true, city: true, source: true, submittedAt: true, createdAt: true, events: true } }),
      this.prisma.event.findMany({ where: { approvalStatus: 'SUBMITTED', submittedAt: range }, ...pg('submittedAt'), select: { name: true, submittedAt: true, createdAt: true, organization: { select: { name: true } } } }),
      this.prisma.payoutAccount.findMany({ where: { status: 'PENDING', submittedAt: range }, ...pg('submittedAt'), select: { submittedAt: true, organization: { select: { name: true } } } }),
      this.prisma.orgTaxProfile.findMany({ where: { status: 'SUBMITTED', submittedAt: range }, ...pg('submittedAt'), select: { submittedAt: true, createdAt: true, organization: { select: { name: true } } } }),
      this.prisma.partner.findMany({ where: { status: 'PENDING', createdAt: range }, ...pg('createdAt'), select: { name: true, createdAt: true } }),
      this.prisma.partnerCampaign.findMany({ where: { status: 'REQUESTED', createdAt: range }, ...pg('createdAt'), select: { createdAt: true, partner: { select: { name: true } }, organization: { select: { name: true } } } }),
      this.prisma.blogger.findMany({ where: { status: 'PENDING', createdAt: range }, ...pg('createdAt'), select: { name: true, city: true, createdAt: true } }),
      this.prisma.bloggerPromotion.findMany({ where: { status: 'PENDING', createdAt: range }, ...pg('createdAt'), select: { createdAt: true, blogger: { select: { name: true } }, event: { select: { name: true } } } }),
      this.prisma.reviewReport.findMany({ where: { resolvedAt: null, createdAt: range }, ...pg('createdAt'), select: { reason: true, createdAt: true, review: { select: { organization: { select: { name: true } } } } } }),
    ]);
    // submittedAt can be null on older rows (or ones set to SUBMITTED directly): fall back to createdAt so sorting never sees null.
    const out: PlatformAlert[] = [
      ...regs.map((r) => {
        const n = Array.isArray(r.events) ? r.events.length : 0;
        return {
          tab: 'registrations' as const, at: r.submittedAt ?? r.createdAt, title: `New mandal registration: ${r.orgName}`,
          detail: `${r.city ?? ''}${r.city ? ' · ' : ''}${n} festival${n === 1 ? '' : 's'}${r.source === 'AGENT' ? ' · filed by a field agent' : ''}`,
        };
      }),
      ...events.map((e) => ({ tab: 'reviews' as const, at: e.submittedAt ?? e.createdAt, title: `Festival submitted for review: ${e.name}`, detail: e.organization.name })),
      ...payouts.map((p) => ({ tab: 'payouts' as const, at: p.submittedAt, title: `Payout & KYC details to verify: ${p.organization.name}`, detail: 'Bank account and PAN submitted' })),
      ...tax.map((t) => ({ tab: 'tax' as const, at: t.submittedAt ?? t.createdAt, title: `80G registration to verify: ${t.organization.name}`, detail: 'Certificate details submitted' })),
      ...partners.map((p) => ({ tab: 'partners' as const, at: p.createdAt, title: `New promotional partner: ${p.name}`, detail: 'Partner account waiting for approval' })),
      ...campaigns.map((c) => ({ tab: 'partners' as const, at: c.createdAt, title: `Partner campaign to approve: ${c.partner.name}`, detail: `At ${c.organization.name}` })),
      ...bloggers.map((b) => ({ tab: 'bloggers' as const, at: b.createdAt, title: `New blogger sign-up: ${b.name}`, detail: b.city ?? '' })),
      ...promotions.map((p) => ({ tab: 'bloggers' as const, at: p.createdAt, title: `Blogger promotion request: ${p.blogger.name}`, detail: `For ${p.event.name}` })),
      ...reports.map((r) => ({ tab: 'reported' as const, at: r.createdAt, title: `Visitor review reported (${r.reason.toLowerCase().replace(/_/g, ' ')})`, detail: r.review.organization.name })),
    ];
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** Who gets the emails: every active super admin with an email, plus PlatformSettings.alertEmails. */
  private async recipients() {
    const [admins, settings] = await Promise.all([
      this.prisma.user.findMany({ where: { isSuperAdmin: true, status: 'ACTIVE' }, select: { id: true, name: true, email: true } }),
      this.prisma.platformSettings.findUnique({ where: { id: 'default' }, select: { alertEmails: true } }),
    ]);
    const extra = (settings?.alertEmails ?? '').split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    const emails = [...new Set([...admins.map((a) => a.email?.toLowerCase()).filter((e): e is string => !!e), ...extra])];
    return { adminIds: admins.map((a) => a.id), emails };
  }

  /**
   * One round: claim (lastCheck, now], announce what's new. On the very first run the
   * marker is only set — nothing older is announced, so a deploy doesn't flood inboxes.
   * Returns what was announced (tests call this directly).
   */
  async runOnce(now = new Date()): Promise<PlatformAlert[]> {
    const s = await this.prisma.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default', alertsCheckedAt: now }, update: {} });
    if (!s.alertsCheckedAt) {
      await this.prisma.platformSettings.updateMany({ where: { id: 'default', alertsCheckedAt: null }, data: { alertsCheckedAt: now } });
      return [];
    }
    const since = s.alertsCheckedAt;
    if (now <= since) return [];
    const claimed = await this.prisma.platformSettings.updateMany({ where: { id: 'default', alertsCheckedAt: since }, data: { alertsCheckedAt: now } });
    if (claimed.count !== 1) return []; // another instance took this round
    const items = await this.newSince(since, now);
    if (items.length) await this.announce(items);
    return items;
  }

  private async announce(items: PlatformAlert[]) {
    const { adminIds, emails } = await this.recipients();
    const counts = await this.pendingCounts();
    const consoleUrl = `${siteUrl()}/platform`;
    const first = items[0];
    const subject = items.length === 1 ? `Parvsetu: ${first.title}` : `Parvsetu: ${items.length} new items waiting for review`;
    const lines = items.map((i) => `• ${i.title}${i.detail ? ` — ${i.detail}` : ''} (${TAB_LABEL[i.tab]})`);
    const waiting = `In total ${counts.total} item${counts.total === 1 ? ' is' : 's are'} waiting in the Platform console.`;
    for (const to of emails) {
      await this.mail.send({
        to,
        ...brandedEmail({
          subject, title: items.length === 1 ? 'Waiting for your review' : `${items.length} new items waiting for review`, name: 'Parvsetu team',
          paragraphs: [...lines, waiting], cta: { label: 'Open the Platform console', url: consoleUrl },
          footer: 'You get this because you are a Parvsetu super admin (or listed under Platform → Billing → Alert emails).',
        }),
      });
    }
    await this.push.sendToUsers(adminIds, {
      title: items.length === 1 ? first.title : `${items.length} new items to review`,
      body: items.length === 1 ? first.detail || TAB_LABEL[first.tab] : items.slice(0, 3).map((i) => i.title).join(' · '),
      url: `/platform#${first.tab}`, tag: 'platform-alerts',
    }).catch(() => undefined);
    this.log.log(`Announced ${items.length} new review item(s) to ${emails.length} email(s) and ${adminIds.length} super admin(s).`);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID || process.env.PLATFORM_ALERTS === 'off') return;
    this.timer = setInterval(() => void this.runOnce().catch((e) => this.log.warn(`Alert round failed: ${e instanceof Error ? e.message : e}`)), ALERT_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
