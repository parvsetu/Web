import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScanResult } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventRef } from '../../common/access/access.service';
import { paged, paging, userRef } from '../../common/http';
import { dayRange, todayIn } from '../../common/time/validity';

export interface RangeQuery {
  from?: string;
  to?: string;
}

type Range = { gte: Date; lt: Date } | null;

const n = (v: unknown) => Number(v ?? 0);
const money = (v: Prisma.Decimal | null | undefined) => (v ?? new Prisma.Decimal(0)).toFixed(2);

/**
 * Every number here is computed from rows (tokens, scan_logs, donations,
 * expenses) at request time — no denormalized counters to drift. Volunteer
 * activity comes from scan_logs, never from a maintained tally.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(event: EventRef, q: RangeQuery): Range {
    if (!q.from && !q.to) return null;
    return dayRange(q.from ?? q.to!, q.to ?? q.from!, event.timezone);
  }

  // ─── Tokens ──────────────────────────────────────────────────────────

  async tokens(event: EventRef, q: RangeQuery) {
    const r = this.range(event, q);
    const now = new Date();
    const rows = await this.prisma.$queryRaw<{ timeSlotId: string | null; label: string | null; bucket: string; c: bigint }[]>`
      SELECT t."timeSlotId", s.label,
        CASE
          WHEN t.status = 'USED' THEN 'used'
          WHEN t.status = 'CANCELLED' THEN 'cancelled'
          WHEN t."validUntil" <= ${now} THEN 'expired'
          WHEN t."validFrom" > ${now} THEN 'notYetValid'
          ELSE 'active'
        END AS bucket,
        count(*) AS c
      FROM tokens t LEFT JOIN time_slots s ON s.id = t."timeSlotId"
      WHERE t."eventId" = ${event.id}
        ${r ? Prisma.sql`AND t."validFrom" >= ${r.gte} AND t."validFrom" < ${r.lt}` : Prisma.empty}
      GROUP BY 1, 2, 3`;

    const totals = { total: 0, active: 0, used: 0, expired: 0, cancelled: 0, notYetValid: 0 };
    const bySlot = new Map<string, { timeSlotId: string | null; label: string; total: number; active: number; used: number; expired: number; cancelled: number; notYetValid: number }>();
    for (const row of rows) {
      const c = n(row.c);
      const b = row.bucket as keyof typeof totals;
      totals.total += c;
      totals[b] += c;
      const k = row.timeSlotId ?? 'custom';
      const s = bySlot.get(k) ?? { timeSlotId: row.timeSlotId, label: row.label ?? 'Custom window', total: 0, active: 0, used: 0, expired: 0, cancelled: 0, notYetValid: 0 };
      s.total += c;
      s[b] += c;
      bySlot.set(k, s);
    }
    return { ...totals, bySlot: [...bySlot.values()].sort((a, b) => a.label.localeCompare(b.label)) };
  }

  // ─── Visitors (successful entries) ───────────────────────────────────

  async visitors(event: EventRef, q: RangeQuery & { timeSlotId?: string }) {
    const r = this.range(event, q);
    const where = Prisma.sql`t."eventId" = ${event.id} AND t.status = 'USED'
      ${r ? Prisma.sql`AND t."usedAt" >= ${r.gte} AND t."usedAt" < ${r.lt}` : Prisma.empty}
      ${q.timeSlotId ? Prisma.sql`AND t."timeSlotId" = ${q.timeSlotId}` : Prisma.empty}`;
    const tz = event.timezone;
    const [totals, bySlot, byDate, byHour] = await Promise.all([
      this.prisma.$queryRaw<{ entries: bigint; visitors: bigint }[]>`
        SELECT count(*) AS entries, coalesce(sum(t."visitorCount"), 0) AS visitors FROM tokens t WHERE ${where}`,
      this.prisma.$queryRaw<{ timeSlotId: string | null; label: string | null; entries: bigint; visitors: bigint }[]>`
        SELECT t."timeSlotId", s.label, count(*) AS entries, coalesce(sum(t."visitorCount"), 0) AS visitors
        FROM tokens t LEFT JOIN time_slots s ON s.id = t."timeSlotId" WHERE ${where} GROUP BY 1, 2 ORDER BY 2`,
      this.prisma.$queryRaw<{ date: string; entries: bigint; visitors: bigint }[]>`
        SELECT to_char(t."usedAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date, count(*) AS entries, coalesce(sum(t."visitorCount"), 0) AS visitors
        FROM tokens t WHERE ${where} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ hour: number; entries: bigint; visitors: bigint }[]>`
        SELECT extract(hour FROM t."usedAt" AT TIME ZONE ${tz})::int AS hour, count(*) AS entries, coalesce(sum(t."visitorCount"), 0) AS visitors
        FROM tokens t WHERE ${where} GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      totalEntries: n(totals[0]?.entries),
      totalVisitors: n(totals[0]?.visitors),
      bySlot: bySlot.map((s) => ({ timeSlotId: s.timeSlotId, label: s.label ?? 'Custom window', entries: n(s.entries), visitors: n(s.visitors) })),
      byDate: byDate.map((d) => ({ date: d.date, entries: n(d.entries), visitors: n(d.visitors) })),
      byHour: byHour.map((h) => ({ hour: h.hour, entries: n(h.entries), visitors: n(h.visitors) })),
    };
  }

  // ─── Scans ───────────────────────────────────────────────────────────

  async scans(event: EventRef, q: RangeQuery & { userId?: string }) {
    const r = this.range(event, q);
    const rows = await this.prisma.scanLog.groupBy({
      by: ['result'],
      where: { eventId: event.id, userId: q.userId, scanTime: r ?? undefined },
      _count: { _all: true },
    });
    const get = (res: ScanResult) => rows.find((x) => x.result === res)?._count._all ?? 0;
    const out = {
      total: rows.reduce((a, x) => a + x._count._all, 0),
      success: get('SUCCESS'),
      alreadyUsed: get('ALREADY_USED'),
      expired: get('EXPIRED'),
      notYetValid: get('NOT_YET_VALID'),
      cancelled: get('CANCELLED'),
      invalid: get('INVALID'),
      wrongEvent: get('WRONG_EVENT'),
      unauthorized: get('UNAUTHORIZED'),
    };
    return { ...out, failed: out.total - out.success };
  }

  // ─── Volunteers (from scan logs) ─────────────────────────────────────

  async volunteers(event: EventRef, q: RangeQuery & { userId?: string; limit?: number }) {
    const r = this.range(event, q);
    const rows = await this.prisma.$queryRaw<{ userId: string; name: string; result: ScanResult; c: bigint; last: Date }[]>`
      SELECT l."userId", u.name, l.result, count(*) AS c, max(l."scanTime") AS last
      FROM scan_logs l JOIN users u ON u.id = l."userId"
      WHERE l."eventId" = ${event.id}
        ${r ? Prisma.sql`AND l."scanTime" >= ${r.gte} AND l."scanTime" < ${r.lt}` : Prisma.empty}
        ${q.userId ? Prisma.sql`AND l."userId" = ${q.userId}` : Prisma.empty}
      GROUP BY 1, 2, 3`;
    const byUser = new Map<string, { userId: string; name: string; total: number; successful: number; duplicate: number; expired: number; notYetValid: number; invalid: number; other: number; failed: number; lastActiveAt: Date | null }>();
    for (const row of rows) {
      const u = byUser.get(row.userId) ?? { userId: row.userId, name: row.name, total: 0, successful: 0, duplicate: 0, expired: 0, notYetValid: 0, invalid: 0, other: 0, failed: 0, lastActiveAt: null };
      const c = n(row.c);
      u.total += c;
      if (row.result === 'SUCCESS') u.successful += c;
      else {
        u.failed += c;
        if (row.result === 'ALREADY_USED') u.duplicate += c;
        else if (row.result === 'EXPIRED') u.expired += c;
        else if (row.result === 'NOT_YET_VALID') u.notYetValid += c;
        else if (row.result === 'INVALID') u.invalid += c;
        else u.other += c;
      }
      if (!u.lastActiveAt || row.last > u.lastActiveAt) u.lastActiveAt = row.last;
      byUser.set(row.userId, u);
    }
    const list = [...byUser.values()].sort((a, b) => b.total - a.total);
    return q.limit ? list.slice(0, q.limit) : list;
  }

  async volunteerActivity(event: EventRef, userId: string) {
    const [user, stats, recent] = await Promise.all([
      // Only people connected to this event/mandal — never an arbitrary user by id.
      this.prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { assignments: { some: { eventId: event.id } } },
            { scanLogs: { some: { eventId: event.id } } },
            { memberships: { some: { organizationId: event.organizationId } } },
          ],
        },
        select: { id: true, name: true },
      }),
      this.volunteers(event, { userId }),
      this.scanLog(event, { userId, pageSize: 50 }),
    ]);
    if (!user) throw new NotFoundException('Volunteer not found');
    const empty = { userId, name: user.name, total: 0, successful: 0, duplicate: 0, expired: 0, notYetValid: 0, invalid: 0, other: 0, failed: 0, lastActiveAt: null };
    return { user, stats: stats[0] ?? empty, recentScans: recent.items };
  }

  async scanLog(event: EventRef, q: { result?: ScanResult; userId?: string; date?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.ScanLogWhereInput = {
      eventId: event.id, result: q.result, userId: q.userId,
      scanTime: q.date ? dayRange(q.date, q.date, event.timezone) : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.scanLog.findMany({
        where, orderBy: { scanTime: 'desc' }, skip, take,
        select: { id: true, scanTime: true, result: true, method: true, failureReason: true, voidedAt: true, user: userRef, token: { select: { tokenCode: true } } },
      }),
      this.prisma.scanLog.count({ where }),
    ]);
    return paged(
      rows.map(({ token, voidedAt, ...s }) => ({ ...s, tokenCode: token?.tokenCode ?? null, voided: voidedAt !== null })),
      total, page, pageSize,
    );
  }

  // ─── Finance ─────────────────────────────────────────────────────────

  async finance(event: EventRef, q: RangeQuery) {
    const r = this.range(event, q);
    const donationWhere: Prisma.DonationWhereInput = { eventId: event.id, donatedAt: r ?? undefined };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      eventId: event.id,
      expenseDate: q.from || q.to ? { gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined, lte: q.to ? new Date(`${q.to}T00:00:00Z`) : undefined } : undefined,
    };
    const [dTotal, dByMethod, dPending, eTotal, eByCat] = await Promise.all([
      this.prisma.donation.aggregate({ where: { ...donationWhere, paymentStatus: 'SUCCESS' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.donation.groupBy({ by: ['method'], where: { ...donationWhere, paymentStatus: 'SUCCESS' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.donation.aggregate({ where: { ...donationWhere, paymentStatus: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.expense.groupBy({ by: ['category'], where: expenseWhere, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const donations = dTotal._sum.amount ?? new Prisma.Decimal(0);
    const expenses = eTotal._sum.amount ?? new Prisma.Decimal(0);
    return {
      donations: {
        total: money(donations), count: dTotal._count._all,
        byMethod: dByMethod.map((m) => ({ method: m.method, total: money(m._sum.amount), count: m._count._all })),
        pending: { total: money(dPending._sum.amount), count: dPending._count._all },
      },
      expenses: {
        total: money(expenses), count: eTotal._count._all,
        byCategory: eByCat.map((c) => ({ category: c.category, total: money(c._sum.amount), count: c._count._all })).sort((a, b) => Number(b.total) - Number(a.total)),
      },
      balance: money(donations.minus(expenses)),
    };
  }

  // ─── Summary / dashboard ─────────────────────────────────────────────

  /** Financial blocks are null (and listed in `restricted`) without DONATION_VIEW / EXPENSE_VIEW. */
  async summary(event: EventRef, perms: Set<string>, q: RangeQuery = {}) {
    const canD = perms.has('DONATION_VIEW');
    const canE = perms.has('EXPENSE_VIEW');
    const [tokens, visitors, scans, fin] = await Promise.all([
      this.tokens(event, q),
      this.visitors(event, q),
      this.scans(event, q),
      canD || canE ? this.finance(event, q) : null,
    ]);
    const restricted: string[] = [];
    if (!canD) restricted.push('donations');
    if (!canE) restricted.push('expenses');
    if (!canD || !canE) restricted.push('balance');
    return {
      event: { id: event.id, name: event.name, status: event.status },
      tokens: { total: tokens.total, used: tokens.used, unused: tokens.active + tokens.notYetValid, expired: tokens.expired, cancelled: tokens.cancelled },
      visitors: { total: visitors.totalVisitors, entries: visitors.totalEntries },
      scans: { total: scans.total, success: scans.success, failed: scans.failed },
      donations: canD && fin ? { total: fin.donations.total, count: fin.donations.count } : null,
      expenses: canE && fin ? { total: fin.expenses.total, count: fin.expenses.count } : null,
      balance: canD && canE && fin ? fin.balance : null,
      restricted,
    };
  }

  async dashboard(event: EventRef, perms: Set<string>, q: { date?: string; timeSlotId?: string; userId?: string }) {
    const date = q.date ?? todayIn(event.timezone);
    const day = dayRange(date, date, event.timezone);
    const now = new Date();
    const slotFilter = q.timeSlotId ? { timeSlotId: q.timeSlotId } : {};
    const [entered, issued, ofTheDay, overall, volunteerActivity, recent, visitors] = await Promise.all([
      this.prisma.token.aggregate({ where: { eventId: event.id, status: 'USED', usedAt: day, ...slotFilter }, _count: { _all: true }, _sum: { visitorCount: true } }),
      this.prisma.token.count({ where: { eventId: event.id, issuedAt: day, ...slotFilter } }),
      this.prisma.token.findMany({
        where: { eventId: event.id, validFrom: day, ...slotFilter },
        select: { status: true, validFrom: true, validUntil: true },
      }),
      this.summary(event, perms),
      this.volunteers(event, { from: date, to: date, userId: q.userId, limit: 10 }),
      this.scanLog(event, { userId: q.userId, pageSize: 20 }),
      this.visitors(event, { from: date, to: date, timeSlotId: q.timeSlotId }),
    ]);
    let used = 0, unused = 0, expired = 0, cancelled = 0;
    for (const t of ofTheDay) {
      if (t.status === 'USED') used++;
      else if (t.status === 'CANCELLED') cancelled++;
      else if (now >= t.validUntil) expired++;
      else unused++;
    }
    return {
      date,
      today: {
        entries: entered._count._all, visitors: entered._sum.visitorCount ?? 0, tokensIssued: issued,
        tokensForDate: ofTheDay.length, used, unused, expired, cancelled,
      },
      overall,
      volunteerActivity,
      recentScans: recent.items,
      hourly: visitors.byHour.map((h) => ({ hour: h.hour, entries: h.entries, visitors: h.visitors })),
    };
  }

  /** Volunteer home: event-wide entries today + the caller's own scans today. */
  async mySummary(event: EventRef, userId: string) {
    const date = todayIn(event.timezone);
    const day = dayRange(date, date, event.timezone);
    const [entered, mine] = await Promise.all([
      this.prisma.token.aggregate({ where: { eventId: event.id, status: 'USED', usedAt: day }, _count: { _all: true }, _sum: { visitorCount: true } }),
      this.volunteers(event, { from: date, to: date, userId }),
    ]);
    const me = mine[0];
    return {
      event: { id: event.id, name: event.name, status: event.status },
      today: { date, entries: entered._count._all, visitors: entered._sum.visitorCount ?? 0 },
      me: {
        scans: me?.total ?? 0, successful: me?.successful ?? 0, duplicate: me?.duplicate ?? 0, expired: me?.expired ?? 0,
        notYetValid: me?.notYetValid ?? 0, invalid: me?.invalid ?? 0, other: me?.other ?? 0, lastActiveAt: me?.lastActiveAt ?? null,
      },
    };
  }

  async orgEvents(orgId: string, perms: Set<string>) {
    const events = await this.prisma.event.findMany({
      where: { organizationId: orgId },
      orderBy: { startDate: 'desc' },
      select: { id: true, organizationId: true, name: true, status: true, timezone: true, startDate: true, endDate: true, tokenPrefix: true, maxVisitorsPerToken: true },
    });
    return Promise.all(events.map((e) => this.summary(e, perms)));
  }
}
