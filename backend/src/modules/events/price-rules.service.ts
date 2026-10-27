import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PriceRule } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { dateOnly, ymd } from '../../common/time/validity';
import { decimalToPaise, effectivePrice, RuleTarget, ticketPrice, toPricingRule } from '../../common/pricing';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './price-rules.dto';

export function presentRule(r: PriceRule) {
  return {
    id: r.id, label: r.label, kind: r.kind, dates: r.dates.map(ymd).sort(), appliesTo: r.appliesTo as RuleTarget,
    timeSlotIds: r.timeSlotIds, programmeItemIds: r.programmeItemIds,
    fixedPrice: r.fixedPricePaise === null ? null : (r.fixedPricePaise / 100).toFixed(2),
    upliftPercent: r.upliftBps === null ? null : r.upliftBps / 100,
    isActive: r.isActive, createdAt: r.createdAt,
  };
}

/** CRUD + preview for peak-day price rules. Prices are resolved only in common/pricing.ts. */
@Injectable()
export class PriceRulesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(eventId: string) {
    const rows = await this.prisma.priceRule.findMany({ where: { eventId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map(presentRule);
  }

  private async validated(eventId: string, merged: {
    kind: 'DATES' | 'WEEKENDS'; dates: string[]; appliesTo: RuleTarget; timeSlotIds: string[]; programmeItemIds: string[]; fixedPrice: string | null; upliftPercent: number | null;
  }) {
    const ev = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, endDate: true } });
    const start = ymd(ev.startDate);
    const end = ymd(ev.endDate);
    if ((merged.fixedPrice === null) === (merged.upliftPercent === null)) {
      throw new BadRequestException('Set either a fixed price or a percentage uplift (not both).');
    }
    let dates: Date[] = [];
    if (merged.kind === 'DATES') {
      const uniq = [...new Set(merged.dates)].sort();
      if (!uniq.length) throw new BadRequestException('Pick at least one date.');
      const outside = uniq.filter((d) => d < start || d > end);
      if (outside.length) throw new BadRequestException(`Dates must be within the festival (${start} to ${end}): ${outside.join(', ')}`);
      dates = uniq.map(dateOnly);
    } else {
      // A weekend rule on a festival with no Saturday/Sunday would never apply — say so.
      let d = DateTime.fromISO(start, { zone: 'utc' });
      let any = false;
      for (let i = 0; d <= DateTime.fromISO(end, { zone: 'utc' }) && i < 7; i++, d = d.plus({ days: 1 })) if (d.weekday >= 6) any = true;
      if (!any) throw new BadRequestException('This festival has no Saturday or Sunday.');
    }
    // A list for the side the rule doesn't price would be silently ignored — drop it.
    const slotIds = merged.appliesTo === 'TICKETS' ? [] : [...new Set(merged.timeSlotIds)];
    const itemIds = merged.appliesTo === 'SLOTS' ? [] : [...new Set(merged.programmeItemIds)];
    if (slotIds.length) {
      const n = await this.prisma.timeSlot.count({ where: { id: { in: slotIds }, eventId } });
      if (n !== slotIds.length) throw new BadRequestException('Time slots must belong to this festival.');
    }
    if (itemIds.length) {
      const n = await this.prisma.programmeItem.count({ where: { id: { in: itemIds }, eventId, ticketed: true } });
      if (n !== itemIds.length) throw new BadRequestException('Programmes must be ticketed programmes of this festival.');
    }
    return {
      kind: merged.kind, dates, appliesTo: merged.appliesTo, timeSlotIds: slotIds, programmeItemIds: itemIds,
      fixedPricePaise: merged.fixedPrice === null ? null : decimalToPaise(merged.fixedPrice),
      upliftBps: merged.upliftPercent === null ? null : Math.round(merged.upliftPercent * 100),
    };
  }

  async create(actor: RequestUser, orgId: string, eventId: string, dto: CreatePriceRuleDto) {
    const data = await this.validated(eventId, {
      kind: dto.kind, dates: dto.dates ?? [], appliesTo: dto.appliesTo ?? 'SLOTS', timeSlotIds: dto.timeSlotIds ?? [], programmeItemIds: dto.programmeItemIds ?? [],
      fixedPrice: dto.fixedPrice ?? null, upliftPercent: dto.upliftPercent ?? null,
    });
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.priceRule.create({ data: { eventId, label: dto.label.trim(), isActive: dto.isActive ?? true, ...data } });
      await this.audit.log({ organizationId: orgId, eventId, actorId: actor.id, action: 'price_rule.created', entityType: 'PriceRule', entityId: r.id, after: presentRule(r) }, tx);
      return presentRule(r);
    });
  }

  private async find(eventId: string, ruleId: string) {
    const r = await this.prisma.priceRule.findFirst({ where: { id: ruleId, eventId } });
    if (!r) throw new NotFoundException('Price rule not found');
    return r;
  }

  async update(actor: RequestUser, orgId: string, eventId: string, ruleId: string, dto: UpdatePriceRuleDto) {
    const before = await this.find(eventId, ruleId);
    const cur = presentRule(before);
    // Switching between fixed and % : sending one clears the other.
    const fixedPrice = dto.fixedPrice !== undefined ? dto.fixedPrice : dto.upliftPercent != null ? null : cur.fixedPrice;
    const upliftPercent = dto.upliftPercent !== undefined ? dto.upliftPercent : dto.fixedPrice != null ? null : cur.upliftPercent;
    const kind = dto.kind ?? before.kind;
    const data = await this.validated(eventId, {
      kind, dates: kind === 'WEEKENDS' ? [] : dto.dates ?? cur.dates, appliesTo: dto.appliesTo ?? cur.appliesTo,
      timeSlotIds: dto.timeSlotIds ?? before.timeSlotIds, programmeItemIds: dto.programmeItemIds ?? before.programmeItemIds, fixedPrice, upliftPercent,
    });
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.priceRule.update({ where: { id: ruleId }, data: { label: dto.label?.trim(), isActive: dto.isActive, ...data } });
      await this.audit.log({ organizationId: orgId, eventId, actorId: actor.id, action: 'price_rule.updated', entityType: 'PriceRule', entityId: r.id, before: cur, after: presentRule(r) }, tx);
      return presentRule(r);
    });
  }

  async remove(actor: RequestUser, orgId: string, eventId: string, ruleId: string) {
    const r = await this.find(eventId, ruleId);
    await this.prisma.$transaction(async (tx) => {
      await tx.priceRule.delete({ where: { id: ruleId } });
      await this.audit.log({ organizationId: orgId, eventId, actorId: actor.id, action: 'price_rule.deleted', entityType: 'PriceRule', entityId: ruleId, before: presentRule(r) }, tx);
    });
  }

  /** Price per active slot (and per ticketed programme on its day) for every festival day (≤ 120 days), exactly as visitors will be charged. */
  async preview(eventId: string) {
    const ev = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, endDate: true } });
    const [slots, items, rules] = await Promise.all([
      this.prisma.timeSlot.findMany({ where: { eventId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }], select: { id: true, label: true, price: true } }),
      this.prisma.programmeItem.findMany({
        where: { eventId, ticketed: true, endTime: { not: null }, status: { not: 'CANCELLED' } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }], select: { id: true, title: true, date: true, ticketPrice: true },
      }),
      this.prisma.priceRule.findMany({ where: { eventId, isActive: true } }),
    ]);
    const pr = rules.map(toPricingRule);
    type Row = { label: string; basePrice: string; price: string; ruleLabel: string | null };
    const days: { date: string; weekend: boolean; slots: (Row & { slotId: string })[]; tickets: (Row & { itemId: string })[] }[] = [];
    let d = DateTime.fromISO(ymd(ev.startDate), { zone: 'utc' });
    const last = DateTime.fromISO(ymd(ev.endDate), { zone: 'utc' });
    for (let i = 0; d <= last && i < 120; i++, d = d.plus({ days: 1 })) {
      const date = d.toISODate()!;
      days.push({
        date, weekend: d.weekday >= 6,
        slots: slots.map((s) => {
          const p = effectivePrice(decimalToPaise(s.price), s.id, date, pr);
          return { slotId: s.id, label: s.label, basePrice: s.price.toFixed(2), price: (p.pricePaise / 100).toFixed(2), ruleLabel: p.rule?.label ?? null };
        }),
        tickets: items.filter((i) => ymd(i.date) === date).map((i) => {
          const p = ticketPrice(decimalToPaise(i.ticketPrice), i.id, date, pr);
          return { itemId: i.id, label: i.title, basePrice: i.ticketPrice.toFixed(2), price: (p.pricePaise / 100).toFixed(2), ruleLabel: p.rule?.label ?? null };
        }),
      });
    }
    return { days, truncated: d <= last };
  }
}

