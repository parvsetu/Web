import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

const TZ = 'Asia/Kolkata';
const zero = () => new Prisma.Decimal(0);
const m = (d: Prisma.Decimal) => d.toFixed(2);

export type Basis = 'calendar' | 'financial';

/** Calendar year Jan–Dec, or Indian financial year Apr→Mar ("FY 2026-27" starts 1 Apr 2026). */
export function yearRange(year: number, basis: Basis) {
  const start = DateTime.fromObject({ year, month: basis === 'financial' ? 4 : 1, day: 1 }, { zone: TZ });
  const end = start.plus({ years: 1 });
  return {
    start, end,
    label: basis === 'financial' ? `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}` : String(year),
    // DATE columns (expenseDate) compare against UTC-midnight dates.
    dateGte: new Date(`${start.toISODate()}T00:00:00.000Z`),
    dateLt: new Date(`${end.toISODate()}T00:00:00.000Z`),
  };
}

/**
 * Mandal profit & loss for a year: income (confirmed donations + paid online
 * passes) against every expense — festival and general — with monthly,
 * per-festival and per-category breakdowns. All figures come straight from
 * rows; nothing is cached.
 */
@Injectable()
export class AnnualReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(orgId: string, year: number, basis: Basis = 'calendar') {
    const r = yearRange(year, basis);
    const at = { gte: r.start.toUTC().toJSDate(), lt: r.end.toUTC().toJSDate() };
    const [donations, passes, expenses, events] = await Promise.all([
      this.prisma.donation.findMany({
        where: { event: { organizationId: orgId }, paymentStatus: 'SUCCESS', donatedAt: at },
        select: { amount: true, donatedAt: true, eventId: true },
      }),
      this.prisma.passOrder.findMany({
        where: { event: { organizationId: orgId }, status: 'PAID', paidAt: at },
        select: { amount: true, paidAt: true, eventId: true },
      }),
      this.prisma.expense.findMany({
        where: { organizationId: orgId, expenseDate: { gte: r.dateGte, lt: r.dateLt } },
        select: { amount: true, expenseDate: true, eventId: true, category: true },
      }),
      this.prisma.event.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, festivalType: true, startDate: true } }),
    ]);

    // 12 months in order from the start of the period.
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = r.start.plus({ months: i });
      return { key: d.toFormat('yyyy-MM'), label: d.toFormat('LLL yyyy'), donations: zero(), passSales: zero(), expenses: zero() };
    });
    const monthOf = (d: Date) => months.find((x) => x.key === DateTime.fromJSDate(d, { zone: TZ }).toFormat('yyyy-MM'));
    const monthOfDate = (d: Date) => months.find((x) => x.key === d.toISOString().slice(0, 7));

    const byEvent = new Map<string, { eventId: string | null; name: string; festivalType: string | null; donations: Prisma.Decimal; passSales: Prisma.Decimal; expenses: Prisma.Decimal }>();
    const eventRow = (id: string | null) => {
      const k = id ?? 'general';
      if (!byEvent.has(k)) {
        const ev = id ? events.find((e) => e.id === id) : null;
        byEvent.set(k, { eventId: id, name: ev?.name ?? 'General (mandal-wide)', festivalType: ev?.festivalType ?? null, donations: zero(), passSales: zero(), expenses: zero() });
      }
      return byEvent.get(k)!;
    };
    const byCategory = new Map<string, Prisma.Decimal>();

    let totalDonations = zero(), totalPasses = zero(), totalExpenses = zero();
    for (const d of donations) {
      totalDonations = totalDonations.plus(d.amount);
      const mo = monthOf(d.donatedAt); if (mo) mo.donations = mo.donations.plus(d.amount);
      const e = eventRow(d.eventId); e.donations = e.donations.plus(d.amount);
    }
    for (const p of passes) {
      totalPasses = totalPasses.plus(p.amount);
      const mo = monthOf(p.paidAt!); if (mo) mo.passSales = mo.passSales.plus(p.amount);
      const e = eventRow(p.eventId); e.passSales = e.passSales.plus(p.amount);
    }
    for (const x of expenses) {
      totalExpenses = totalExpenses.plus(x.amount);
      const mo = monthOfDate(x.expenseDate); if (mo) mo.expenses = mo.expenses.plus(x.amount);
      const e = eventRow(x.eventId); e.expenses = e.expenses.plus(x.amount);
      byCategory.set(x.category, (byCategory.get(x.category) ?? zero()).plus(x.amount));
    }

    const income = totalDonations.plus(totalPasses);
    const net = income.minus(totalExpenses);
    return {
      year, basis, label: r.label, from: r.start.toISODate(), to: r.end.minus({ days: 1 }).toISODate(),
      income: { total: m(income), donations: m(totalDonations), passSales: m(totalPasses), donationCount: donations.length, passOrderCount: passes.length },
      expenses: { total: m(totalExpenses), count: expenses.length },
      net: m(net),
      result: net.gt(0) ? 'PROFIT' : net.lt(0) ? 'LOSS' : 'BREAK_EVEN',
      byMonth: months.map((x) => ({
        month: x.key, label: x.label, donations: m(x.donations), passSales: m(x.passSales),
        income: m(x.donations.plus(x.passSales)), expenses: m(x.expenses), net: m(x.donations.plus(x.passSales).minus(x.expenses)),
      })),
      byEvent: [...byEvent.values()]
        .map((e) => ({ ...e, donations: m(e.donations), passSales: m(e.passSales), expenses: m(e.expenses), net: m(e.donations.plus(e.passSales).minus(e.expenses)) }))
        .sort((a, b) => (a.eventId === null ? 1 : b.eventId === null ? -1 : a.name.localeCompare(b.name))),
      byCategory: [...byCategory.entries()].map(([category, total]) => ({ category, total: m(total) })).sort((a, b) => Number(b.total) - Number(a.total)),
    };
  }
}
