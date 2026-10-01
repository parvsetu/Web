import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EventRef } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { paged, paging, userRef } from '../../common/http';
import { dateOnly, ymd } from '../../common/time/validity';
import { CreateExpenseDto, CreateOrgExpenseDto, ExpenseListQuery, OrgExpenseListQuery, UpdateExpenseDto } from './expenses.dto';

const expenseSelect = {
  id: true, eventId: true, category: true, description: true, amount: true, expenseDate: true, vendor: true, receiptRef: true,
  createdAt: true, createdBy: userRef, event: { select: { id: true, name: true } },
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;
const present = (e: ExpenseRow) => ({ ...e, amount: e.amount.toFixed(2), expenseDate: ymd(e.expenseDate) });

function textFilter(q?: string): Prisma.ExpenseWhereInput {
  const t = q?.trim();
  return t
    ? { OR: [{ description: { contains: t, mode: 'insensitive' } }, { vendor: { contains: t, mode: 'insensitive' } }, { category: { contains: t, mode: 'insensitive' } }] }
    : {};
}

function dateFilter(q: { from?: string; to?: string }) {
  return q.from || q.to ? { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined } : undefined;
}

/**
 * Expenses belong to a mandal and optionally to one of its festivals.
 * Festival screens see that festival's rows; the mandal Accounts screen sees
 * everything, including general (festival-less) expenses.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async listWhere(where: Prisma.ExpenseWhereInput, q: ExpenseListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const [items, total, sum] = await Promise.all([
      this.prisma.expense.findMany({ where, select: expenseSelect, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { ...paged(items.map(present), total, page, pageSize), totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
  }

  list(event: EventRef, q: ExpenseListQuery) {
    return this.listWhere({
      eventId: event.id,
      category: q.category ? { equals: q.category, mode: 'insensitive' } : undefined,
      expenseDate: dateFilter(q),
      ...textFilter(q.q),
    }, q);
  }

  listForOrg(orgId: string, q: OrgExpenseListQuery) {
    return this.listWhere({
      organizationId: orgId,
      eventId: q.eventId === 'none' ? null : q.eventId,
      category: q.category ? { equals: q.category, mode: 'insensitive' } : undefined,
      expenseDate: dateFilter(q),
      ...textFilter(q.q),
    }, q);
  }

  create(actor: RequestUser, event: EventRef, dto: CreateExpenseDto) {
    return this.insert(actor, event.organizationId, event.id, dto);
  }

  async createForOrg(actor: RequestUser, orgId: string, dto: CreateOrgExpenseDto) {
    if (dto.eventId) {
      const ev = await this.prisma.event.findFirst({ where: { id: dto.eventId, organizationId: orgId }, select: { id: true } });
      if (!ev) throw new BadRequestException('That festival does not belong to this mandal');
    }
    return this.insert(actor, orgId, dto.eventId ?? null, dto);
  }

  private insert(actor: RequestUser, organizationId: string, eventId: string | null, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          organizationId, eventId, category: dto.category.trim(), description: dto.description.trim(),
          amount: new Prisma.Decimal(dto.amount), expenseDate: dateOnly(dto.expenseDate),
          vendor: dto.vendor ?? null, receiptRef: dto.receiptRef ?? null, createdById: actor.id,
        },
        select: expenseSelect,
      });
      await this.audit.log({ organizationId, eventId, actorId: actor.id, action: 'expense.created', entityType: 'Expense', entityId: e.id, after: present(e) }, tx);
      return present(e);
    });
  }

  update(actor: RequestUser, event: EventRef, id: string, dto: UpdateExpenseDto) {
    return this.change(actor, { id, eventId: event.id }, event.organizationId, dto);
  }

  updateForOrg(actor: RequestUser, orgId: string, id: string, dto: UpdateExpenseDto) {
    return this.change(actor, { id, organizationId: orgId }, orgId, dto);
  }

  private async change(actor: RequestUser, where: Prisma.ExpenseWhereInput, organizationId: string, dto: UpdateExpenseDto) {
    const before = await this.prisma.expense.findFirst({ where, select: expenseSelect });
    if (!before) throw new NotFoundException('Expense not found');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.update({
        where: { id: before.id },
        data: {
          category: dto.category?.trim(), description: dto.description?.trim(),
          amount: dto.amount ? new Prisma.Decimal(dto.amount) : undefined,
          expenseDate: dto.expenseDate ? dateOnly(dto.expenseDate) : undefined,
          vendor: dto.vendor, receiptRef: dto.receiptRef,
        },
        select: expenseSelect,
      });
      await this.audit.log({
        organizationId, eventId: before.eventId, actorId: actor.id, action: 'expense.updated',
        entityType: 'Expense', entityId: before.id, before: present(before), after: present(e), reason: dto.reason,
      }, tx);
      return present(e);
    });
  }
}
