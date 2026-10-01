import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EventRef } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { paged, paging, userRef } from '../../common/http';
import { dateOnly, ymd } from '../../common/time/validity';
import { CreateExpenseDto, ExpenseListQuery, UpdateExpenseDto } from './expenses.dto';

const expenseSelect = {
  id: true, category: true, description: true, amount: true, expenseDate: true, vendor: true, receiptRef: true,
  createdAt: true, createdBy: userRef,
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;
const present = (e: ExpenseRow) => ({ ...e, amount: e.amount.toFixed(2), expenseDate: ymd(e.expenseDate) });

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(event: EventRef, q: ExpenseListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.ExpenseWhereInput = {
      eventId: event.id,
      category: q.category ? { equals: q.category, mode: 'insensitive' } : undefined,
      expenseDate: q.from || q.to ? { gte: q.from ? dateOnly(q.from) : undefined, lte: q.to ? dateOnly(q.to) : undefined } : undefined,
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.expense.findMany({ where, select: expenseSelect, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { ...paged(items.map(present), total, page, pageSize), totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
  }

  async create(actor: RequestUser, event: EventRef, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          eventId: event.id, category: dto.category.trim(), description: dto.description.trim(),
          amount: new Prisma.Decimal(dto.amount), expenseDate: dateOnly(dto.expenseDate),
          vendor: dto.vendor ?? null, receiptRef: dto.receiptRef ?? null, createdById: actor.id,
        },
        select: expenseSelect,
      });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'expense.created',
        entityType: 'Expense', entityId: e.id, after: present(e),
      }, tx);
      return present(e);
    });
  }

  async update(actor: RequestUser, event: EventRef, id: string, dto: UpdateExpenseDto) {
    const before = await this.prisma.expense.findFirst({ where: { id, eventId: event.id }, select: expenseSelect });
    if (!before) throw new NotFoundException('Expense not found');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.update({
        where: { id },
        data: {
          category: dto.category?.trim(), description: dto.description?.trim(),
          amount: dto.amount ? new Prisma.Decimal(dto.amount) : undefined,
          expenseDate: dto.expenseDate ? dateOnly(dto.expenseDate) : undefined,
          vendor: dto.vendor, receiptRef: dto.receiptRef,
        },
        select: expenseSelect,
      });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'expense.updated',
        entityType: 'Expense', entityId: id, before: present(before), after: present(e), reason: dto.reason,
      }, tx);
      return present(e);
    });
  }
}
