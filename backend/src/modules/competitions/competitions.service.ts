import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { Competition, CompetitionCategory, CompetitionEntry, Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, toCsv } from '../../common/http';
import { LIVE_WHERE } from '../../common/event-approval';
import { dateOnly, todayIn, ymd } from '../../common/time/validity';
import { BillingService, rupees, toPaise } from '../billing/billing.service';
import { PayoutsService } from '../payouts/payouts.service';
import { PaymentProvider } from '../donations/payment-provider';
import { PASS_GATEWAYS, demoPaymentsEnabled } from '../passes/pass-gateways';
import {
  AssignHeatsDto, CancelEntryDto, CheckInDto, CompetitionCategoryDto, CreateCompetitionDto, CreateEntryDto, EntryListQuery, ResultDto, UpdateCompetitionDto,
} from './competitions.dto';
import {
  ADULT_AGE, ENTRY_HOLD_MINUTES, MAX_COMPETITIONS_PER_EVENT, ResultType, ageOn, centreOutLanes, computeRanks, eligibility, formatTime, parseTime,
  publicName, quoteEntry, seededShuffle,
} from './competitions.rules';

type Tx = Prisma.TransactionClient;

/** Festivals whose competitions are public: reviewed + paid, running or finished. */
const PUBLIC_EVENT = { ...LIVE_WHERE, status: { in: ['ACTIVE', 'COMPLETED'] } } satisfies Prisma.EventWhereInput;
/** Paid entries, plus unpaid ones still inside their payment window, take a spot. */
const holding = (now = new Date()): Prisma.CompetitionEntryWhereInput => ({ OR: [{ status: 'PAID' }, { status: 'PENDING', expiresAt: { gt: now } }] });

const eventSelect = { id: true, slug: true, name: true, organizationId: true, timezone: true, tokenPrefix: true, gstEnabled: true, status: true, approvalStatus: true, startDate: true, endDate: true, organization: { select: { name: true } } } as const;
const entryInclude = {
  competition: { include: { event: { select: eventSelect } } },
  category: true,
} as const;
type EntryRow = Prisma.CompetitionEntryGetPayload<{ include: typeof entryInclude }>;

function resultDisplay(type: string, e: Pick<CompetitionEntry, 'resultStatus' | 'resultMs' | 'resultScore'>): string | null {
  if (!e.resultStatus) return null;
  if (e.resultStatus !== 'FINISHED') return e.resultStatus;
  if (type === 'TIME' && e.resultMs !== null) return formatTime(e.resultMs);
  if (type === 'SCORE' && e.resultScore !== null) return e.resultScore.toFixed(2).replace(/\.00$/, '');
  return null;
}

function presentCategory(c: CompetitionCategory, taken = 0) {
  return {
    id: c.id, name: c.name, gender: c.gender, minAge: c.minAge, maxAge: c.maxAge, fee: rupees(c.feePaise), capacity: c.capacity,
    taken, spotsLeft: c.capacity === null ? null : Math.max(0, c.capacity - taken), isActive: c.isActive, sortOrder: c.sortOrder,
  };
}

function presentCompetition(c: Competition) {
  return {
    id: c.id, eventId: c.eventId, name: c.name, kind: c.kind, resultType: c.resultType, description: c.description, rules: c.rules,
    date: ymd(c.date), startTime: c.startTime, venue: c.venue, setting: c.setting, lanes: c.lanes,
    registrationOpen: c.registrationOpen, registrationClosesAt: c.registrationClosesAt, safetyDeclaration: c.safetyDeclaration,
    isPublished: c.isPublished, resultsPublished: c.resultsPublished, sortOrder: c.sortOrder,
  };
}

/** Why registration is closed (null = open). */
function closedReason(c: Competition, ev: { status: string; approvalStatus: string; timezone: string }, now = new Date()): string | null {
  if (ev.approvalStatus !== 'LIVE' || ev.status !== 'ACTIVE') return 'This festival isn’t taking entries.';
  if (!c.isPublished || !c.registrationOpen) return 'Registration is closed.';
  if (c.registrationClosesAt && c.registrationClosesAt <= now) return 'Registration has closed.';
  if (ymd(c.date) < todayIn(ev.timezone, now)) return 'This competition is over.';
  return null;
}

/**
 * Festival competitions: set-up (organiser), online entry with a no-login access
 * key and online-only fees (visitor), check-in, heats & lanes, results and
 * certificates. Spots can't be oversold: every hold is checked under a row lock
 * on the category, counting paid entries plus unexpired unpaid ones. Paid fees
 * go through PaymentSettlement (sourceType COMPETITION_ENTRY), so the platform
 * fee shows in billing and the rest in the mandal's settlements/payouts.
 */
@Injectable()
export class CompetitionsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly payouts: PayoutsService,
    @Inject(PASS_GATEWAYS) private readonly gateways: PaymentProvider[],
  ) {}

  // ─── Set-up (organiser) ──────────────────────────────────────────────

  private async event(eventId: string) {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: eventSelect });
    if (!ev) throw new NotFoundException('Festival not found');
    return ev;
  }

  private async competition(eventId: string, id: string, db: Tx | PrismaService = this.prisma) {
    const c = await db.competition.findFirst({ where: { id, eventId }, include: { categories: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } });
    if (!c) throw new NotFoundException('Competition not found');
    return c;
  }

  private async counts(competitionIds: string[]) {
    const now = new Date();
    const [held, paid, checked] = await Promise.all([
      this.prisma.competitionEntry.groupBy({ by: ['categoryId'], where: { competitionId: { in: competitionIds }, ...holding(now) }, _count: { _all: true } }),
      this.prisma.competitionEntry.groupBy({ by: ['categoryId'], where: { competitionId: { in: competitionIds }, status: 'PAID' }, _count: { _all: true } }),
      this.prisma.competitionEntry.groupBy({ by: ['categoryId'], where: { competitionId: { in: competitionIds }, status: 'PAID', checkedInAt: { not: null } }, _count: { _all: true } }),
    ]);
    const m = (rows: { categoryId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.categoryId, r._count._all]));
    return { held: m(held), paid: m(paid), checked: m(checked) };
  }

  async list(eventId: string) {
    const rows = await this.prisma.competition.findMany({
      where: { eventId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { sortOrder: 'asc' }],
      include: { categories: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    const n = await this.counts(rows.map((r) => r.id));
    return rows.map((c) => ({
      ...presentCompetition(c),
      categories: c.categories.map((cat) => ({ ...presentCategory(cat, n.held.get(cat.id) ?? 0), paid: n.paid.get(cat.id) ?? 0, checkedIn: n.checked.get(cat.id) ?? 0 })),
    }));
  }

  private assertDate(ev: { startDate: Date; endDate: Date }, date: string) {
    dateOnly(date);
    if (date < ymd(ev.startDate) || date > ymd(ev.endDate)) throw new BadRequestException(`Pick a date within the festival (${ymd(ev.startDate)} to ${ymd(ev.endDate)}).`);
  }

  private categoryData(c: CompetitionCategoryDto, i: number) {
    if (c.minAge != null && c.maxAge != null && c.minAge > c.maxAge) throw new BadRequestException(`“${c.name}”: the minimum age is above the maximum.`);
    return {
      name: c.name.trim(), gender: c.gender ?? 'ANY', minAge: c.minAge ?? null, maxAge: c.maxAge ?? null,
      feePaise: c.fee ? toPaise(c.fee) : 0, capacity: c.capacity ?? null, isActive: c.isActive ?? true, sortOrder: i,
    };
  }

  private competitionData(dto: UpdateCompetitionDto) {
    const clean = (s: string | undefined) => (s === undefined ? undefined : s.trim() || null);
    return {
      name: dto.name?.trim(), kind: dto.kind, resultType: dto.resultType, description: clean(dto.description), rules: clean(dto.rules),
      date: dto.date === undefined ? undefined : dateOnly(dto.date), startTime: dto.startTime, venue: clean(dto.venue),
      setting: dto.setting === undefined ? undefined : dto.setting ?? null, lanes: dto.lanes === undefined ? undefined : dto.lanes ?? null,
      registrationOpen: dto.registrationOpen,
      registrationClosesAt: dto.registrationClosesAt === undefined ? undefined : dto.registrationClosesAt ? new Date(dto.registrationClosesAt) : null,
      safetyDeclaration: clean(dto.safetyDeclaration), isPublished: dto.isPublished, resultsPublished: dto.resultsPublished, sortOrder: dto.sortOrder,
    } satisfies Prisma.CompetitionUncheckedUpdateInput;
  }

  async create(actor: RequestUser, eventId: string, dto: CreateCompetitionDto) {
    const ev = await this.event(eventId);
    this.assertDate(ev, dto.date);
    const cats = (dto.categories ?? []).map((c, i) => this.categoryData(c, i));
    if (dto.registrationOpen && !cats.some((c) => c.isActive)) throw new BadRequestException('Add at least one category before opening registration.');
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.competition.count({ where: { eventId } })) >= MAX_COMPETITIONS_PER_EVENT) throw new BadRequestException(`A festival can have at most ${MAX_COMPETITIONS_PER_EVENT} competitions.`);
      const c = await tx.competition.create({
        data: { ...this.competitionData(dto), resultsPublished: false, organizationId: ev.organizationId, eventId, name: dto.name.trim(), date: dateOnly(dto.date), startTime: dto.startTime, categories: { create: cats } },
      });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'competition.created', entityType: 'Competition', entityId: c.id, after: { name: c.name, categories: cats.length } }, tx);
      return c.id;
    }).then(async (id) => (await this.list(eventId)).find((c) => c.id === id)!);
  }

  async update(actor: RequestUser, eventId: string, id: string, dto: UpdateCompetitionDto) {
    const ev = await this.event(eventId);
    const before = await this.competition(eventId, id);
    if (dto.date !== undefined) this.assertDate(ev, dto.date);
    if (dto.resultType && dto.resultType !== before.resultType && (await this.prisma.competitionEntry.count({ where: { competitionId: id, resultStatus: { not: null } } }))) {
      throw new ConflictException({ statusCode: 409, code: 'RESULTS_RECORDED', message: 'Results are already recorded — clear them before changing how results work.' });
    }
    const removedWithEntries: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      if (dto.categories) {
        const known = new Map(before.categories.map((c) => [c.id, c]));
        if (dto.categories.some((c) => c.id && !known.has(c.id))) throw new BadRequestException('A category in the list does not belong to this competition.');
        const keep = new Set(dto.categories.filter((c) => c.id).map((c) => c.id!));
        for (const old of before.categories.filter((c) => !keep.has(c.id))) {
          // A category with entries is kept (inactive) so the entries and money stay traceable.
          if (await tx.competitionEntry.count({ where: { categoryId: old.id } })) {
            await tx.competitionCategory.update({ where: { id: old.id }, data: { isActive: false } });
            removedWithEntries.push(old.name);
          } else {
            await tx.competitionCategory.delete({ where: { id: old.id } });
          }
        }
        for (const [i, c] of dto.categories.entries()) {
          const data = this.categoryData(c, i);
          if (c.id) await tx.competitionCategory.update({ where: { id: c.id }, data });
          else await tx.competitionCategory.create({ data: { ...data, competitionId: id } });
        }
      }
      await tx.competition.update({ where: { id }, data: this.competitionData(dto) });
      const after = await this.competition(eventId, id, tx);
      if (after.registrationOpen && !after.categories.some((c) => c.isActive)) throw new BadRequestException('Add at least one active category before opening registration.');
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'competition.updated', entityType: 'Competition', entityId: id,
        before: presentCompetition(before), after: presentCompetition(after),
      }, tx);
    });
    return { ...(await this.list(eventId)).find((c) => c.id === id)!, keptInactive: removedWithEntries };
  }

  async remove(actor: RequestUser, eventId: string, id: string) {
    const ev = await this.event(eventId);
    const c = await this.competition(eventId, id);
    // Paid or refunded entries are money records: they must stay.
    if (await this.prisma.competitionEntry.count({ where: { competitionId: id, OR: [{ status: 'PAID' }, { status: 'CANCELLED' }, { paidAt: { not: null } }] } })) {
      throw new ConflictException({ statusCode: 409, code: 'HAS_PAID_ENTRIES', message: 'People have already paid for this competition. Close registration or unpublish it instead of deleting.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.competitionEntry.deleteMany({ where: { competitionId: id } });
      await tx.competition.delete({ where: { id } });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'competition.deleted', entityType: 'Competition', entityId: id, before: presentCompetition(c) }, tx);
    });
  }

  // ─── Entries (organiser) ─────────────────────────────────────────────

  private presentForMandal(e: EntryRow) {
    return {
      ...this.presentCommon(e),
      dateOfBirth: ymd(e.dateOfBirth), phone: e.phone, email: e.email, city: e.city,
      guardianName: e.guardianName, guardianPhone: e.guardianPhone, guardianConsentAt: e.guardianConsentAt,
      emergencyName: e.emergencyName, emergencyPhone: e.emergencyPhone, declarationAcceptedAt: e.declarationAcceptedAt,
      platformFee: rupees(e.platformFeePaise), paymentReference: e.paymentReference,
      cancelledAt: e.cancelledAt, cancelReason: e.cancelReason, refund: rupees(e.refundPaise), refundReference: e.refundReference, creditNoteNo: e.creditNoteNo,
      resultNote: e.resultNote, resultScore: e.resultScore?.toFixed(2) ?? null, resultMs: e.resultMs,
    };
  }

  private entryWhere(eventId: string, competitionId: string, q: EntryListQuery): Prisma.CompetitionEntryWhereInput {
    const t = q.q?.trim();
    const bib = t && /^\d{1,5}$/.test(t) ? Number(t) : null;
    return {
      eventId, competitionId, categoryId: q.categoryId,
      status: q.status ?? { in: ['PAID', 'CANCELLED'] },
      ...(t ? { OR: [{ participantName: { contains: t, mode: 'insensitive' } }, { phone: { contains: t } }, ...(bib ? [{ bibNo: bib }] : [])] } : {}),
    };
  }

  async entries(eventId: string, competitionId: string, q: EntryListQuery) {
    await this.competition(eventId, competitionId);
    await this.expireStale({ competitionId });
    const { page, pageSize, skip, take } = paging(q, 50);
    const where = this.entryWhere(eventId, competitionId, q);
    const [rows, total] = await Promise.all([
      this.prisma.competitionEntry.findMany({ where, include: entryInclude, orderBy: [{ heat: 'asc' }, { lane: 'asc' }, { bibNo: 'asc' }, { createdAt: 'asc' }], skip, take }),
      this.prisma.competitionEntry.count({ where }),
    ]);
    return paged(rows.map((e) => this.presentForMandal(e)), total, page, pageSize);
  }

  async entriesCsv(eventId: string, competitionId: string) {
    const c = await this.competition(eventId, competitionId);
    const rows = await this.prisma.competitionEntry.findMany({
      where: { competitionId, status: { in: ['PAID', 'CANCELLED'] } }, include: entryInclude, orderBy: [{ categoryId: 'asc' }, { heat: 'asc' }, { lane: 'asc' }, { bibNo: 'asc' }],
    });
    const csv = toCsv(rows.map((e) => ({
      bib: e.bibNo ?? '', category: e.category.name, name: e.participantName, gender: e.gender, age: e.ageOnDay, dob: ymd(e.dateOfBirth),
      phone: e.phone, guardian: e.guardianName ?? '', guardianPhone: e.guardianPhone ?? '', emergency: `${e.emergencyName} ${e.emergencyPhone}`,
      status: e.status, paid: rupees(e.amountPaise), invoice: e.invoiceNo ?? '', checkedIn: e.checkedInAt ? 'yes' : '', heat: e.heat ?? '', lane: e.lane ?? '',
      result: resultDisplay(c.resultType, e) ?? '', rank: e.rank ?? '',
    })));
    return { csv, filename: `${c.name.replace(/[^\w-]+/g, '-').toLowerCase()}-entries.csv` };
  }

  private async entryInEvent(eventId: string, entryId: string) {
    const e = await this.prisma.competitionEntry.findFirst({ where: { id: entryId, eventId }, include: entryInclude });
    if (!e) throw new NotFoundException('Entry not found');
    return e;
  }

  /** Check-in at the venue: by the entrant's QR (entry id) or bib number. Paid entries only. */
  async checkIn(actor: RequestUser, eventId: string, competitionId: string, dto: CheckInDto) {
    await this.competition(eventId, competitionId);
    if (!dto.entryId && !dto.bibNo) throw new BadRequestException('Scan the entry QR or type the bib number.');
    const e = await this.prisma.competitionEntry.findFirst({
      where: { competitionId, eventId, ...(dto.entryId ? { id: dto.entryId } : { bibNo: dto.bibNo }) }, include: entryInclude,
    });
    if (!e) throw new NotFoundException('No entry with that QR / bib number in this competition.');
    if (e.status !== 'PAID') throw new ConflictException({ statusCode: 409, code: 'ENTRY_NOT_PAID', message: `This entry is ${e.status.toLowerCase()}, not paid.` });
    const undo = dto.checkedIn === false;
    const alreadyIn = !!e.checkedInAt;
    if (undo || !alreadyIn) {
      await this.prisma.$transaction(async (tx) => {
        await tx.competitionEntry.update({ where: { id: e.id }, data: undo ? { checkedInAt: null, checkedInById: null } : { checkedInAt: new Date(), checkedInById: actor.id } });
        await this.audit.log({ organizationId: e.organizationId, eventId, actorId: actor.id, action: undo ? 'competition_entry.check_in_undone' : 'competition_entry.checked_in', entityType: 'CompetitionEntry', entityId: e.id }, tx);
      });
    }
    const after = await this.entryInEvent(eventId, e.id);
    return { alreadyCheckedIn: alreadyIn && !undo, entry: { ...this.presentCommon(after), ageOnDay: after.ageOnDay, gender: after.gender } };
  }

  /** Splits paid (by default checked-in) entries of a category into heats, seeding the middle lanes first. */
  async assignHeats(actor: RequestUser, eventId: string, competitionId: string, dto: AssignHeatsDto) {
    const c = await this.competition(eventId, competitionId);
    if (!c.lanes) throw new BadRequestException('Set the number of lanes on this competition first.');
    if (!c.categories.some((x) => x.id === dto.categoryId)) throw new NotFoundException('Category not found');
    const onlyCheckedIn = dto.onlyCheckedIn ?? true;
    const lanes = c.lanes;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM competition_categories WHERE id = ${dto.categoryId} FOR UPDATE`;
      const rows = await tx.competitionEntry.findMany({ where: { categoryId: dto.categoryId, status: 'PAID' }, select: { id: true, checkedInAt: true, bibNo: true }, orderBy: { bibNo: 'asc' } });
      const pool = rows.filter((r) => !onlyCheckedIn || r.checkedInAt);
      if (!pool.length) throw new BadRequestException(onlyCheckedIn ? 'Nobody in this category has checked in yet.' : 'No paid entries in this category.');
      await tx.competitionEntry.updateMany({ where: { categoryId: dto.categoryId }, data: { heat: null, lane: null } });
      const order = seededShuffle(pool, `${dto.categoryId}:${pool.length}`);
      const heats = Math.ceil(order.length / lanes);
      // Spread people evenly (7 swimmers, 6 lanes → heats of 4 and 3, not 6 and 1).
      const base = Math.floor(order.length / heats);
      let extra = order.length % heats;
      let i = 0;
      const first = dto.firstHeat ?? 1;
      for (let h = 0; h < heats; h++) {
        const size = base + (extra-- > 0 ? 1 : 0);
        const laneOrder = centreOutLanes(lanes);
        for (let k = 0; k < size; k++, i++) {
          await tx.competitionEntry.update({ where: { id: order[i].id }, data: { heat: first + h, lane: laneOrder[k] } });
        }
      }
      await this.audit.log({ organizationId: c.organizationId, eventId, actorId: actor.id, action: 'competition.heats_assigned', entityType: 'CompetitionCategory', entityId: dto.categoryId, after: { entries: pool.length, heats, lanes, onlyCheckedIn } }, tx);
      return { heats, entries: pool.length };
    });
    return result;
  }

  /** Records one result; TIME / SCORE ranks of the whole category are recomputed in the same transaction. */
  async setResult(actor: RequestUser, eventId: string, entryId: string, dto: ResultDto) {
    const e = await this.entryInEvent(eventId, entryId);
    if (e.status !== 'PAID') throw new ConflictException({ statusCode: 409, code: 'ENTRY_NOT_PAID', message: 'Results can only be recorded for paid entries.' });
    const type = e.competition.resultType as ResultType;
    const finished = dto.resultStatus === 'FINISHED';
    const data: Prisma.CompetitionEntryUncheckedUpdateInput = {
      resultStatus: dto.resultStatus, resultNote: dto.note?.trim() || null,
      resultMs: type === 'TIME' && finished ? (dto.time ? parseTime(dto.time) : null) : null,
      resultScore: type === 'SCORE' && finished ? (dto.score ? new Prisma.Decimal(dto.score) : null) : null,
      ...(dto.heat !== undefined ? { heat: dto.heat } : {}), ...(dto.lane !== undefined ? { lane: dto.lane } : {}),
    };
    if (finished && type === 'TIME' && data.resultMs === null) throw new BadRequestException('Enter the time.');
    if (finished && type === 'SCORE' && data.resultScore === null) throw new BadRequestException('Enter the score.');
    if (type === 'RANK') data.rank = finished ? (dto.rank ?? null) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM competition_categories WHERE id = ${e.categoryId} FOR UPDATE`;
      await tx.competitionEntry.update({ where: { id: e.id }, data });
      if (type !== 'RANK') await this.rerank(tx, e.categoryId, type);
      await this.audit.log({
        organizationId: e.organizationId, eventId, actorId: actor.id, action: 'competition_entry.result_recorded', entityType: 'CompetitionEntry', entityId: e.id,
        before: { resultStatus: e.resultStatus, result: resultDisplay(type, e), rank: e.rank }, after: { resultStatus: dto.resultStatus, time: dto.time ?? null, score: dto.score ?? null, rank: dto.rank ?? null },
      }, tx);
    });
    return this.presentForMandal(await this.entryInEvent(eventId, e.id));
  }

  async clearResult(actor: RequestUser, eventId: string, entryId: string) {
    const e = await this.entryInEvent(eventId, entryId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM competition_categories WHERE id = ${e.categoryId} FOR UPDATE`;
      await tx.competitionEntry.update({ where: { id: e.id }, data: { resultStatus: null, resultMs: null, resultScore: null, rank: null, resultNote: null } });
      if (e.competition.resultType !== 'RANK') await this.rerank(tx, e.categoryId, e.competition.resultType as 'TIME' | 'SCORE');
      await this.audit.log({ organizationId: e.organizationId, eventId, actorId: actor.id, action: 'competition_entry.result_cleared', entityType: 'CompetitionEntry', entityId: e.id }, tx);
    });
    return this.presentForMandal(await this.entryInEvent(eventId, e.id));
  }

  private async rerank(tx: Tx, categoryId: string, type: 'TIME' | 'SCORE') {
    const rows = await tx.competitionEntry.findMany({ where: { categoryId, status: 'PAID' }, select: { id: true, resultStatus: true, resultMs: true, resultScore: true, rank: true } });
    const ranks = computeRanks(type, rows.map((r) => ({ ...r, resultScore: r.resultScore === null ? null : Number(r.resultScore) })));
    for (const r of rows) {
      const rank = ranks.get(r.id) ?? null;
      if (rank !== r.rank) await tx.competitionEntry.update({ where: { id: r.id }, data: { rank } });
    }
  }

  /** Cancels a paid entry (e.g. the event was called off); refund defaults to everything paid. */
  async cancelEntry(actor: RequestUser, eventId: string, entryId: string, dto: CancelEntryDto) {
    const e = await this.entryInEvent(eventId, entryId);
    const refundPaise = dto.refund === undefined ? e.amountPaise : toPaise(dto.refund);
    if (refundPaise > e.amountPaise) throw new BadRequestException({ statusCode: 400, code: 'REFUND_TOO_HIGH', message: `The refund can't be more than the ₹${rupees(e.amountPaise)} paid.` });
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.competitionEntry.updateMany({
        where: { id: e.id, status: 'PAID' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id, cancelReason: dto.reason.trim(), refundPaise, refundReference: dto.refundReference?.trim() || null, heat: null, lane: null, rank: null },
      });
      if (moved.count !== 1) throw new ConflictException({ statusCode: 409, code: 'ENTRY_NOT_PAID', message: 'Only a paid entry can be cancelled.' });
      let creditNoteNo: string | null = null;
      if (refundPaise > 0) {
        const share = (x: number) => Math.round((x * refundPaise) / e.amountPaise);
        const feeBack = share(e.platformFeePaise);
        await tx.paymentSettlement.create({
          data: {
            organizationId: e.organizationId, eventId, sourceType: 'COMPETITION_REFUND', sourceId: `refund:${e.id}`,
            grossPaise: -refundPaise, gatewayFeePaise: 0, commissionPaise: -feeBack, netPaise: -(refundPaise - feeBack), gstPaise: -share(e.gstPaise),
          },
        });
        if (e.invoiceNo && e.gstPaise > 0) {
          const [row] = await tx.$queryRaw<{ competitionCreditNoteSeq: number; tokenPrefix: string; startDate: Date }[]>`
            UPDATE events SET "competitionCreditNoteSeq" = "competitionCreditNoteSeq" + 1 WHERE id = ${eventId} RETURNING "competitionCreditNoteSeq", "tokenPrefix", "startDate"`;
          creditNoteNo = `${row.tokenPrefix}-CCN-${row.startDate.getUTCFullYear()}-${String(row.competitionCreditNoteSeq).padStart(5, '0')}`;
          await tx.competitionEntry.update({ where: { id: e.id }, data: { creditNoteNo } });
        }
      }
      if (e.competition.resultType !== 'RANK') await this.rerank(tx, e.categoryId, e.competition.resultType as 'TIME' | 'SCORE');
      await this.audit.log({
        organizationId: e.organizationId, eventId, actorId: actor.id, action: 'competition_entry.cancelled', entityType: 'CompetitionEntry', entityId: e.id,
        before: { status: 'PAID' }, after: { status: 'CANCELLED', refund: rupees(refundPaise), refundReference: dto.refundReference ?? null, creditNoteNo }, reason: dto.reason,
      }, tx);
    });
    return this.presentForMandal(await this.entryInEvent(eventId, e.id));
  }

  // ─── Public ──────────────────────────────────────────────────────────

  private async publicCompetitions(where: Prisma.CompetitionWhereInput) {
    const rows = await this.prisma.competition.findMany({
      where: { ...where, isPublished: true, event: PUBLIC_EVENT },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { sortOrder: 'asc' }],
      include: { categories: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, event: { select: eventSelect } },
    });
    const n = await this.counts(rows.map((r) => r.id));
    const withResults = rows.filter((r) => r.resultsPublished).map((r) => r.id);
    const results = withResults.length
      ? await this.prisma.competitionEntry.findMany({
        where: { competitionId: { in: withResults }, status: 'PAID', resultStatus: { not: null } },
        select: { competitionId: true, categoryId: true, participantName: true, city: true, rank: true, resultStatus: true, resultMs: true, resultScore: true },
        orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { participantName: 'asc' }],
      })
      : [];
    const gstOn = (r: (typeof rows)[number]) => r.event.gstEnabled;
    return rows.map((c) => {
      const { event: ev, categories, ...rest } = c;
      return {
        ...presentCompetition(rest as Competition),
        rules: c.rules, safetyDeclaration: c.safetyDeclaration,
        event: { id: ev.id, slug: ev.slug, name: ev.name, organization: ev.organization.name },
        closedReason: closedReason(c, ev),
        gstOnFees: gstOn(c),
        categories: categories.map((cat) => {
          const p = presentCategory(cat, n.held.get(cat.id) ?? 0);
          return {
            id: p.id, name: p.name, gender: p.gender, minAge: p.minAge, maxAge: p.maxAge, fee: p.fee, spotsLeft: p.spotsLeft, full: p.spotsLeft === 0,
            entrants: n.paid.get(cat.id) ?? 0,
            results: c.resultsPublished
              ? results.filter((x) => x.categoryId === cat.id).slice(0, 100).map((x) => ({
                rank: x.rank, name: publicName(x.participantName), city: x.city, result: resultDisplay(c.resultType, x),
              }))
              : null,
          };
        }),
      };
    });
  }

  async publicForEvent(eventId: string) {
    return this.publicCompetitions({ eventId });
  }

  async publicOne(id: string) {
    const [c] = await this.publicCompetitions({ id });
    if (!c) throw new NotFoundException('Competition not found');
    return c;
  }

  private declaration(c: Competition) {
    return [
      c.rules ? `Rules: ${c.rules}` : 'I will follow the organisers’ rules and instructions.',
      c.safetyDeclaration ? `Safety: ${c.safetyDeclaration}` : null,
      'The participant takes part at their own risk; the organisers may refuse or stop participation for safety.',
    ].filter(Boolean).join('\n');
  }

  async createEntry(dto: CreateEntryDto) {
    const gateway = this.gateways[0];
    const cat = await this.prisma.competitionCategory.findUnique({ where: { id: dto.categoryId }, include: { competition: { include: { event: { select: eventSelect } } } } }).catch(() => null);
    const c = cat?.competition;
    if (!cat || !c || !cat.isActive || !c.isPublished) throw new NotFoundException('This category isn’t open for entries.');
    const reason = closedReason(c, c.event);
    if (reason) throw new ConflictException({ statusCode: 409, code: 'REGISTRATION_CLOSED', message: reason });
    dateOnly(dto.dateOfBirth);
    const age = ageOn(dto.dateOfBirth, ymd(c.date));
    const notEligible = eligibility(cat, dto.gender, age);
    if (notEligible) throw new BadRequestException({ statusCode: 400, code: 'NOT_ELIGIBLE', message: notEligible });
    if (!dto.acceptDeclaration) throw new BadRequestException({ statusCode: 400, code: 'DECLARATION_REQUIRED', message: 'Please accept the rules and safety declaration.' });
    const minor = age < ADULT_AGE;
    if (minor && (!dto.guardianName?.trim() || !dto.guardianPhone || !dto.guardianConsent)) {
      throw new BadRequestException({ statusCode: 400, code: 'GUARDIAN_REQUIRED', message: 'The participant is under 18: a parent or guardian must give their name, phone and consent.' });
    }
    const phone = normalizeMobile(dto.phone);
    const emergencyPhone = normalizeMobile(dto.emergencyPhone);
    const guardianPhone = minor ? normalizeMobile(dto.guardianPhone!) : dto.guardianPhone ? normalizeMobile(dto.guardianPhone) : null;
    const rates = await this.billing.rates(this.prisma, c.organizationId);
    const q = quoteEntry({ feePaise: cat.feePaise, gstOn: c.event.gstEnabled, commissionBps: rates.competitionCommissionBps });
    const free = q.amountPaise === 0;
    if (!free) {
      if (!gateway) throw new ServiceUnavailableException({ statusCode: 503, code: 'NO_PAYMENTS', message: 'Online payment isn’t available right now.' });
      if (!(await this.payouts.isVerified(c.organizationId))) {
        throw new ConflictException({ statusCode: 409, code: 'PAYOUTS_NOT_READY', message: 'This mandal can’t take online payments yet. Please try again later.' });
      }
    }
    const name = dto.participantName.trim().replace(/\s+/g, ' ');
    const now = new Date();

    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM competition_categories WHERE id = ${cat.id} FOR UPDATE`;
      const dup = await tx.competitionEntry.findFirst({
        where: { categoryId: cat.id, participantName: { equals: name, mode: 'insensitive' }, dateOfBirth: dateOnly(dto.dateOfBirth), ...holding(now) },
        select: { status: true },
      });
      if (dup) {
        throw new ConflictException({
          statusCode: 409, code: 'ALREADY_ENTERED',
          message: dup.status === 'PAID' ? `${name} is already entered in this category.` : `${name} has an unpaid entry in this category — finish that payment or wait ${ENTRY_HOLD_MINUTES} minutes.`,
        });
      }
      if (cat.capacity !== null) {
        const taken = await tx.competitionEntry.count({ where: { categoryId: cat.id, ...holding(now) } });
        if (taken >= cat.capacity) throw new ConflictException({ statusCode: 409, code: 'CATEGORY_FULL', message: 'This category is full.' });
      }
      const e = await tx.competitionEntry.create({
        data: {
          organizationId: c.organizationId, eventId: c.eventId, competitionId: c.id, categoryId: cat.id,
          participantName: name, dateOfBirth: dateOnly(dto.dateOfBirth), ageOnDay: age, gender: dto.gender, phone,
          email: dto.email ? normalizeEmail(dto.email) : null, city: dto.city?.trim() || null,
          guardianName: dto.guardianName?.trim() || null, guardianPhone, guardianConsentAt: dto.guardianConsent && (minor || dto.guardianName) ? now : null,
          emergencyName: dto.emergencyName.trim(), emergencyPhone, declarationText: this.declaration(c), declarationAcceptedAt: now,
          basePaise: q.basePaise, gstRateBps: q.gstRateBps, gstPaise: q.gstPaise, amountPaise: q.amountPaise,
          commissionBps: rates.competitionCommissionBps, platformFeePaise: q.platformFeePaise,
          paymentProvider: free ? 'free' : gateway!.key, accessKey: randomBytes(24).toString('base64url'),
          expiresAt: new Date(now.getTime() + ENTRY_HOLD_MINUTES * 60_000),
        },
      });
      await this.audit.log({
        organizationId: c.organizationId, eventId: c.eventId, action: 'competition_entry.created', entityType: 'CompetitionEntry', entityId: e.id,
        after: { competition: c.name, category: cat.name, amount: rupees(e.amountPaise) },
      }, tx);
      if (free) await this.markPaid(tx, e, null);
      return e.id;
    });

    if (!free) {
      const payment = await gateway!.createPayment({ reference: id, amount: rupees(q.amountPaise), currency: 'INR', payerName: name, description: `${c.name} — ${cat.name}` });
      await this.prisma.competitionEntry.update({ where: { id }, data: { providerOrderId: payment.providerOrderId } });
    }
    const row = await this.prisma.competitionEntry.findUniqueOrThrow({ where: { id }, include: entryInclude });
    return { ...this.presentForEntrant(row), accessKey: row.accessKey };
  }

  /** The entrant's view (no account: the random access key proves it's theirs). */
  async getEntry(id: string, k: string) {
    let e = await this.byKey(id, k);
    if (e.status === 'PENDING' && e.expiresAt <= new Date()) {
      await this.prisma.competitionEntry.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      e = await this.byKey(id, k);
    }
    return this.presentForEntrant(e);
  }

  private async byKey(id: string, k: string) {
    const e = await this.prisma.competitionEntry.findUnique({ where: { id }, include: entryInclude }).catch(() => null);
    const a = Buffer.from(e?.accessKey ?? 'x'.repeat(32));
    const b = Buffer.from(k ?? '');
    if (!e || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Entry not found');
    return e;
  }

  /** Demo checkout result. Idempotent; serialised on the entry row. */
  async demoPay(id: string, k: string, outcome: 'success' | 'fail') {
    if (!demoPaymentsEnabled()) throw new NotFoundException();
    await this.byKey(id, k);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM competition_entries WHERE id = ${id} FOR UPDATE`;
      const e = await tx.competitionEntry.findUniqueOrThrow({ where: { id } });
      if (e.paymentProvider !== 'demo') throw new BadRequestException('This entry is not a demo payment.');
      if (e.status === 'PAID') return;
      if (e.status !== 'PENDING') throw new ConflictException({ statusCode: 409, code: 'ENTRY_CLOSED', message: 'This entry is no longer open for payment. Please enter again.' });
      if (e.expiresAt <= new Date()) throw new ConflictException({ statusCode: 409, code: 'ENTRY_EXPIRED', message: `The ${ENTRY_HOLD_MINUTES}-minute hold ran out. Please enter again.` });
      if (outcome === 'fail') {
        await tx.competitionEntry.update({ where: { id }, data: { status: 'FAILED' } });
        return;
      }
      await this.markPaid(tx, e, `demo_pay_${randomBytes(6).toString('hex')}`);
    }).catch(async (err) => {
      if (err instanceof ConflictException && (err.getResponse() as { code?: string }).code === 'ENTRY_EXPIRED') {
        await this.prisma.competitionEntry.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      }
      throw err;
    });
    return this.getEntry(id, k);
  }

  /** Paid: bib number, tax invoice (if any), platform split. Capacity re-checked with this entry's own hold excluded. */
  private async markPaid(tx: Tx, e: CompetitionEntry, paymentReference: string | null) {
    const cat = await tx.competitionCategory.findUniqueOrThrow({ where: { id: e.categoryId } });
    if (cat.capacity !== null) {
      const taken = await tx.competitionEntry.count({ where: { categoryId: e.categoryId, id: { not: e.id }, ...holding() } });
      if (taken >= cat.capacity) throw new ConflictException({ statusCode: 409, code: 'CATEGORY_FULL', message: 'This category filled up. You have not been charged.' });
    }
    const [bib] = await tx.$queryRaw<{ bibSeq: number }[]>`UPDATE competitions SET "bibSeq" = "bibSeq" + 1 WHERE id = ${e.competitionId} RETURNING "bibSeq"`;
    let invoiceNo: string | null = null;
    if (e.amountPaise > 0) {
      const [row] = await tx.$queryRaw<{ competitionInvoiceSeq: number; tokenPrefix: string; startDate: Date }[]>`
        UPDATE events SET "competitionInvoiceSeq" = "competitionInvoiceSeq" + 1 WHERE id = ${e.eventId} RETURNING "competitionInvoiceSeq", "tokenPrefix", "startDate"`;
      invoiceNo = `${row.tokenPrefix}-CMP-${row.startDate.getUTCFullYear()}-${String(row.competitionInvoiceSeq).padStart(5, '0')}`;
    }
    await tx.competitionEntry.update({ where: { id: e.id }, data: { status: 'PAID', paidAt: new Date(), paymentReference, invoiceNo, bibNo: bib.bibSeq } });
    if (e.amountPaise > 0) {
      await this.payouts.recordSettlement(tx, {
        organizationId: e.organizationId, eventId: e.eventId, sourceType: 'COMPETITION_ENTRY', sourceId: e.id,
        grossPaise: e.amountPaise, commissionPaise: e.platformFeePaise, gstPaise: e.gstPaise,
      });
    }
    await this.audit.log({
      organizationId: e.organizationId, eventId: e.eventId, action: 'competition_entry.paid', entityType: 'CompetitionEntry', entityId: e.id,
      after: { bibNo: bib.bibSeq, invoiceNo, amount: rupees(e.amountPaise), platformFee: rupees(e.platformFeePaise) },
    }, tx);
  }

  /** Certificate data: once results are published, for a paid entrant who took part (checked in or has a result). */
  async certificate(id: string, k: string) {
    const e = await this.byKey(id, k);
    const c = e.competition;
    if (e.status !== 'PAID' || !c.resultsPublished || (!e.checkedInAt && !e.resultStatus)) {
      throw new NotFoundException({ statusCode: 404, code: 'NO_CERTIFICATE', message: 'The certificate is available once results are published.' });
    }
    const winner = e.resultStatus === 'FINISHED' && e.rank !== null && e.rank <= 3;
    return {
      kind: winner ? 'WINNER' : 'PARTICIPATION', rank: winner ? e.rank : null,
      participantName: e.participantName, category: e.category.name, competition: c.name, competitionKind: c.kind,
      result: resultDisplay(c.resultType, e), date: ymd(c.date), venue: c.venue,
      event: { name: c.event.name, slug: c.event.slug, id: c.event.id }, organization: c.event.organization.name, bibNo: e.bibNo,
      certificateNo: `${c.event.tokenPrefix}-CRT-${e.id.slice(0, 8).toUpperCase()}`,
    };
  }

  private presentCommon(e: EntryRow) {
    const c = e.competition;
    return {
      id: e.id, status: e.status, bibNo: e.bibNo, participantName: e.participantName, ageOnDay: e.ageOnDay, gender: e.gender,
      competition: { id: c.id, name: c.name, kind: c.kind, resultType: c.resultType, date: ymd(c.date), startTime: c.startTime, venue: c.venue, resultsPublished: c.resultsPublished },
      category: { id: e.category.id, name: e.category.name },
      event: { id: c.event.id, slug: c.event.slug, name: c.event.name, organization: c.event.organization.name, timezone: c.event.timezone },
      base: rupees(e.basePaise), gstPercent: String(e.gstRateBps / 100), gst: rupees(e.gstPaise), amount: rupees(e.amountPaise),
      invoiceNo: e.invoiceNo, paymentProvider: e.paymentProvider, expiresAt: e.expiresAt, paidAt: e.paidAt, createdAt: e.createdAt,
      checkedInAt: e.checkedInAt, heat: e.heat, lane: e.lane,
      resultStatus: e.resultStatus, result: resultDisplay(c.resultType, e), rank: e.rank,
    };
  }

  private presentForEntrant(e: EntryRow) {
    const p = this.presentCommon(e);
    const showResult = e.competition.resultsPublished;
    return {
      ...p,
      resultStatus: showResult ? p.resultStatus : null, result: showResult ? p.result : null, rank: showResult ? p.rank : null,
      qrPayload: e.status === 'PAID' ? `PVS-CMP:${e.id}` : null,
      certificateAvailable: e.status === 'PAID' && showResult && (!!e.checkedInAt || !!e.resultStatus),
      cancelReason: e.cancelReason, refund: rupees(e.refundPaise),
    };
  }

  // ─── Expiry ──────────────────────────────────────────────────────────

  private async expireStale(where: Prisma.CompetitionEntryWhereInput = {}) {
    const r = await this.prisma.competitionEntry.updateMany({ where: { ...where, status: 'PENDING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
    return r.count;
  }

  private sweeper?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      this.sweeper = setInterval(() => void this.expireStale().catch(() => undefined), 60_000);
    }
  }
  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }
}
