import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessService } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { defaultPrefixFor } from '../../common/festival-types';
import { FestivalCatalogService } from '../../common/catalog/festival-catalog.service';
import { NOT_LIVE_MESSAGE, PRE_LIVE_STATUSES } from '../../common/event-approval';
import { rupees } from '../billing/billing.service';
import { presentVenue, venueData } from '../../common/venue';
import { dateOnly, isValidTimezone, slotCrossesMidnight, ymd } from '../../common/time/validity';

import { RolesService } from '../organizations/roles.service';
import { SearchPageQuery, paged, paging, searchTerm } from '../../common/http';
import { stateOrThrow } from '../organizations/organizations.service';
import {
  CreateAssignmentDto, CreateEventDto, CreateTimeSlotDto, UpdateAssignmentDto, UpdateEventDto, UpdateTimeSlotDto,
} from './events.dto';

/** Maps GST/print settings from the DTO (percent → basis points). */
// passPrintFormat in the DTO is accepted but ignored: the platform sets the pass layout per mandal.
function gstData(dto: { gstEnabled?: boolean; gstRatePercent?: number; gstBearer?: string; gstSac?: string; gstMode?: string; gstLowRatePercent?: number; gstSlabThreshold?: number }) {
  return {
    gstMode: dto.gstMode, gstLowRateBps: dto.gstLowRatePercent === undefined ? undefined : Math.round(dto.gstLowRatePercent * 100),
    gstSlabThresholdPaise: dto.gstSlabThreshold === undefined ? undefined : Math.round(dto.gstSlabThreshold * 100),
    gstEnabled: dto.gstEnabled, gstRateBps: dto.gstRatePercent === undefined ? undefined : Math.round(dto.gstRatePercent * 100),
    gstBearer: dto.gstBearer, gstSac: dto.gstSac,
  };
}

export function presentEvent(e: Event & { organization?: { id: string; name: string; festivalTypes?: string[] } }, myPermissions?: Set<string>) {
  return {
    id: e.id, organizationId: e.organizationId, organization: e.organization,
    name: e.name, festivalType: e.festivalType, description: e.description, location: e.location, state: e.state, city: e.city,
    startDate: ymd(e.startDate), endDate: ymd(e.endDate), timezone: e.timezone, status: e.status,
    tokenPrefix: e.tokenPrefix, volunteerRegistrationOpen: e.volunteerRegistrationOpen, publicBookingEnabled: e.publicBookingEnabled,
    tokenDurationOptions: e.tokenDurationOptions,
    gstEnabled: e.gstEnabled, gstRatePercent: e.gstRateBps / 100, gstBearer: e.gstBearer, gstSac: e.gstSac,
    gstMode: e.gstMode, gstLowRatePercent: e.gstLowRateBps / 100, gstSlabThreshold: e.gstSlabThresholdPaise / 100,
    venueAddress: e.venueAddress, venueLandmark: e.venueLandmark, venuePincode: e.venuePincode, venueMapUrl: e.venueMapUrl,
    venueLat: e.venueLat, venueLng: e.venueLng, venueNotes: e.venueNotes, venueContactPhone: e.venueContactPhone,
    venue: presentVenue(e),
    maxVisitorsPerToken: e.maxVisitorsPerToken, createdAt: e.createdAt,
    approvalStatus: e.approvalStatus,
    approval: presentApproval(e),
    myPermissions: myPermissions ? [...myPermissions].sort() : undefined,
  };
}

/** Platform review / fee state of an event, as the mandal sees it. */
export function presentApproval(e: Pick<Event, 'approvalStatus' | 'feeLegacy' | 'feeQuotedPaise' | 'feePaise' | 'feeSource' | 'submittedAt' | 'reviewedAt' | 'reviewNote' | 'liveAt'>) {
  return {
    status: e.approvalStatus, legacy: e.feeLegacy,
    feeQuoted: e.feeQuotedPaise !== null ? rupees(e.feeQuotedPaise) : null,
    fee: e.feePaise !== null ? rupees(e.feePaise) : null,
    feeSource: e.feeSource, submittedAt: e.submittedAt, reviewedAt: e.reviewedAt, reviewNote: e.reviewNote, liveAt: e.liveAt,
  };
}

/** Not-yet-live events may only be DRAFT or CANCELLED. */
function assertStatusAllowed(approvalStatus: string, status?: string) {
  if (status && approvalStatus !== 'LIVE' && !(PRE_LIVE_STATUSES as readonly string[]).includes(status)) {
    throw new ConflictException({ statusCode: 409, code: 'EVENT_NOT_LIVE', message: `${NOT_LIVE_MESSAGE} Until then it can only be a draft.` });
  }
}

export function presentSlot(s: { id: string; label: string; startTime: string; endTime: string; capacity: number | null; isActive: boolean; sortOrder: number; price: Prisma.Decimal }) {
  return { ...s, price: s.price.toFixed(2), crossesMidnight: slotCrossesMidnight(s.startTime, s.endTime) };
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly roles: RolesService,
    private readonly billing: BillingService,
    private readonly catalog: FestivalCatalogService,
  ) {}

  /**
   * A mandal may only run the festival types the platform allowed it
   * (Organization.festivalTypes, set at registration by the super admin; empty
   * = no restriction) — plus a custom type it proposed itself, while that is
   * under review. The super admin is not restricted.
   */
  async assertFestivalAllowed(actor: RequestUser, orgId: string, festivalType: string) {
    if (actor.isSuperAdmin) return;
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { festivalTypes: true } });
    if (!org.festivalTypes.length || org.festivalTypes.includes(festivalType)) return;
    const own = await this.prisma.customFestivalType.findFirst({ where: { key: festivalType, organizationId: orgId, status: { not: 'REJECTED' } }, select: { key: true } });
    if (own) return;
    throw new BadRequestException({
      statusCode: 400, code: 'FESTIVAL_NOT_ALLOWED',
      message: 'Your mandal is not registered for this festival type. Ask the Parvsetu team to add it, or choose “My event isn’t listed”.',
    });
  }

  /** Read-only for the mandal: the platform decides the pass layout (AUTO / A4 / thermal). */
  private async withPrintFormat<T extends { organizationId: string }>(e: T) {
    return { ...e, passPrintFormat: (await this.billing.rates(this.prisma, e.organizationId)).passPrintFormat };
  }

  async listForOrg(orgId: string, q: SearchPageQuery = {}) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.EventWhereInput = {
      organizationId: orgId,
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { festivalType: { contains: t.replace(/\s+/g, '_'), mode: 'insensitive' } }, { city: { contains: t, mode: 'insensitive' } }, { location: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({ where, orderBy: { startDate: 'desc' }, skip, take, include: { organization: { select: { id: true, name: true, festivalTypes: true } } } }),
      this.prisma.event.count({ where }),
    ]);
    return paged(events.map((e) => presentEvent(e)), total, page, pageSize);
  }

  async get(eventId: string, perms: Set<string>) {
    const e = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { organization: { select: { id: true, name: true, festivalTypes: true } } } });
    return this.withPrintFormat(presentEvent(e, perms));
  }

  private validateDates(start: string, end: string, tz: string) {
    const s = dateOnly(start);
    const e = dateOnly(end);
    if (e < s) throw new BadRequestException('endDate must be on or after startDate');
    if (!isValidTimezone(tz)) throw new BadRequestException(`Unknown timezone "${tz}"`);
    return { s, e };
  }

  async create(actor: RequestUser, orgId: string, dto: CreateEventDto) {
    if (dto.gstEnabled) await this.assertGstin(orgId);
    // New events always start as a platform DRAFT: set up freely, then submit for review.
    assertStatusAllowed('DRAFT', dto.status);
    if (!dto.customFestival && !dto.festivalType) throw new BadRequestException('Choose a festival type, or describe your event under “My event isn’t listed”.');
    if (dto.festivalType && !dto.customFestival) await this.assertFestivalAllowed(actor, orgId, dto.festivalType);
    const timezone = dto.timezone ?? 'Asia/Kolkata';
    const { s, e } = this.validateDates(dto.startDate, dto.endDate, timezone);
    return this.prisma.$transaction(async (tx) => {
      // "My event isn't listed": a custom type, reviewed with the event's submission.
      let festivalType = dto.festivalType!;
      if (dto.customFestival) {
        festivalType = await this.catalog.newCustomKey(dto.customFestival.name, tx);
        await tx.customFestivalType.create({
          data: {
            key: festivalType, label: dto.customFestival.name.trim(), group: dto.customFestival.group, description: dto.customFestival.description?.trim() || null,
            defaultPrefix: defaultPrefixFor(festivalType), organizationId: orgId, createdById: actor.id,
          },
        });
      }
      const ev = await tx.event.create({
        data: {
          organizationId: orgId, name: dto.name.trim(), festivalType,
          description: dto.description, location: dto.location, startDate: s, endDate: e, timezone, ...venueData(dto),
          ...(await this.defaultPlace(orgId, dto)),
          status: dto.status ?? 'DRAFT', approvalStatus: 'DRAFT', tokenPrefix: dto.tokenPrefix ?? defaultPrefixFor(festivalType),
          volunteerRegistrationOpen: dto.volunteerRegistrationOpen ?? false,
          publicBookingEnabled: dto.publicBookingEnabled ?? false,
          tokenDurationOptions: dto.tokenDurationOptions ? [...new Set(dto.tokenDurationOptions)].sort((a, b) => a - b) : undefined,
          ...gstData(dto),
          maxVisitorsPerToken: dto.maxVisitorsPerToken ?? 10,
        },
        include: { organization: { select: { id: true, name: true, festivalTypes: true } } },
      });
      await this.audit.log({ organizationId: orgId, eventId: ev.id, actorId: actor.id, action: 'event.created', entityType: 'Event', entityId: ev.id, after: presentEvent(ev) }, tx);
      return presentEvent(ev);
    });
  }

  /** Charging GST needs the mandal's GSTIN (entered in Payouts & bank). */
  private async assertGstin(orgId: string) {
    const p = await this.prisma.payoutAccount.findUnique({ where: { organizationId: orgId }, select: { gstin: true } });
    if (!p?.gstin) throw new BadRequestException({ message: 'Add the mandal’s GSTIN in “Payouts & bank” before charging GST.', code: 'GSTIN_REQUIRED' });
  }

  /** A new festival takes the mandal's state/city unless given its own. */
  private async defaultPlace(orgId: string, dto: { state?: string; city?: string }) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { state: true, city: true } });
    return { state: dto.state !== undefined ? stateOrThrow(dto.state) : org.state, city: dto.city?.trim() || org.city };
  }

  async update(actor: RequestUser, eventId: string, dto: UpdateEventDto) {
    const before = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    if (dto.gstEnabled && !before.gstEnabled) await this.assertGstin(before.organizationId);
    if (dto.status !== before.status) assertStatusAllowed(before.approvalStatus, dto.status);
    if (dto.festivalType && dto.festivalType !== before.festivalType) {
      // The fee depends on the type: it can't change while the platform is reviewing / awaiting payment.
      if (before.approvalStatus === 'SUBMITTED' || before.approvalStatus === 'APPROVED_AWAITING_PAYMENT') {
        throw new ConflictException({ statusCode: 409, code: 'EVENT_IN_REVIEW', message: 'The festival type can’t be changed while the platform is reviewing this event.' });
      }
      await this.assertFestivalAllowed(actor, before.organizationId, dto.festivalType);
    }
    const timezone = dto.timezone ?? before.timezone;
    const { s, e } = this.validateDates(dto.startDate ?? ymd(before.startDate), dto.endDate ?? ymd(before.endDate), timezone);
    return this.prisma.$transaction(async (tx) => {
      const ev = await tx.event.update({
        where: { id: eventId },
        data: {
          name: dto.name?.trim(), festivalType: dto.festivalType, description: dto.description, location: dto.location,
          state: stateOrThrow(dto.state), city: dto.city?.trim(), ...venueData(dto),
          startDate: s, endDate: e, timezone, status: dto.status, tokenPrefix: dto.tokenPrefix,
          volunteerRegistrationOpen: dto.volunteerRegistrationOpen, publicBookingEnabled: dto.publicBookingEnabled,
          tokenDurationOptions: dto.tokenDurationOptions ? [...new Set(dto.tokenDurationOptions)].sort((a, b) => a - b) : undefined,
          ...gstData(dto),
          maxVisitorsPerToken: dto.maxVisitorsPerToken,
        },
        include: { organization: { select: { id: true, name: true, festivalTypes: true } } },
      });
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'event.updated', entityType: 'Event', entityId: eventId,
        before: presentEvent(before), after: presentEvent(ev),
      }, tx);
      return presentEvent(ev);
    }).then((ev) => this.withPrintFormat(ev));
  }

  async remove(actor: RequestUser, eventId: string) {
    const ev = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { _count: { select: { tokens: true, donations: true, expenses: true, feePayments: { where: { status: { in: ['PAID', 'WAIVED', 'REFUNDED'] } } } } } },
    });
    if (ev.status !== 'DRAFT' || ev._count.tokens + ev._count.donations + ev._count.expenses + ev._count.feePayments > 0) {
      throw new ConflictException({ message: 'Only a draft event with no tokens, donations or expenses can be deleted. Cancel it instead.', code: 'EVENT_IN_USE' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id: eventId } });
      await this.audit.log({ organizationId: ev.organizationId, actorId: actor.id, action: 'event.deleted', entityType: 'Event', entityId: eventId, before: presentEvent(ev) }, tx);
    });
  }

  /** Events the user can see at all (EVENT_VIEW), computed via AccessService. */
  async listMine(actor: RequestUser) {
    const candidates = await this.prisma.event.findMany({
      where: actor.isSuperAdmin ? {} : {
        OR: [
          { organization: { members: { some: { userId: actor.id, status: 'ACTIVE' } } } },
          { assignments: { some: { userId: actor.id, status: 'ACTIVE' } } },
        ],
      },
      include: { organization: { select: { id: true, name: true, festivalTypes: true } } },
      orderBy: { startDate: 'desc' },
    });
    const out = [];
    for (const e of candidates) {
      const ctx = await this.access.eventAccess(actor, e.id);
      if (ctx?.perms.has('EVENT_VIEW')) out.push(presentEvent(e, ctx.perms));
    }
    return out;
  }

  // ─── Time slots (token validity configuration) ────────────────────────

  async slots(eventId: string) {
    const slots = await this.prisma.timeSlot.findMany({ where: { eventId }, orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] });
    return slots.map(presentSlot);
  }

  async createSlot(actor: RequestUser, orgId: string, eventId: string, dto: CreateTimeSlotDto) {
    if (dto.startTime === dto.endTime) throw new BadRequestException('Start and end time cannot be the same');
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.timeSlot.create({
        data: {
          eventId, label: dto.label.trim(), startTime: dto.startTime, endTime: dto.endTime, capacity: dto.capacity ?? null,
          isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0, price: dto.price ? new Prisma.Decimal(dto.price) : undefined,
        },
      });
      await this.audit.log({ organizationId: orgId, eventId, actorId: actor.id, action: 'timeslot.created', entityType: 'TimeSlot', entityId: slot.id, after: slot }, tx);
      return presentSlot(slot);
    });
  }

  async updateSlot(actor: RequestUser, orgId: string, eventId: string, slotId: string, dto: UpdateTimeSlotDto) {
    const before = await this.prisma.timeSlot.findFirst({ where: { id: slotId, eventId } });
    if (!before) throw new NotFoundException('Time slot not found');
    const start = dto.startTime ?? before.startTime;
    const end = dto.endTime ?? before.endTime;
    if (start === end) throw new BadRequestException('Start and end time cannot be the same');
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.timeSlot.update({
        where: { id: slotId },
        data: {
          label: dto.label?.trim(), startTime: dto.startTime, endTime: dto.endTime, capacity: dto.capacity, isActive: dto.isActive,
          sortOrder: dto.sortOrder, price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        },
      });
      await this.audit.log({ organizationId: orgId, eventId, actorId: actor.id, action: 'timeslot.updated', entityType: 'TimeSlot', entityId: slotId, before, after: slot }, tx);
      return presentSlot(slot);
    });
  }

  async removeSlot(actor: RequestUser, orgId: string, eventId: string, slotId: string) {
    const slot = await this.prisma.timeSlot.findFirst({ where: { id: slotId, eventId }, include: { _count: { select: { tokens: true } } } });
    if (!slot) throw new NotFoundException('Time slot not found');
    return this.prisma.$transaction(async (tx) => {
      // Tokens keep their own window, but the slot label is still shown on them
      // and in reports — so a used slot is deactivated, not deleted.
      if (slot._count.tokens > 0) {
        await tx.timeSlot.update({ where: { id: slotId }, data: { isActive: false } });
      } else {
        await tx.timeSlot.delete({ where: { id: slotId } });
      }
      await this.audit.log({
        organizationId: orgId, eventId, actorId: actor.id,
        action: slot._count.tokens > 0 ? 'timeslot.deactivated' : 'timeslot.deleted',
        entityType: 'TimeSlot', entityId: slotId, before: slot,
      }, tx);
      return { deleted: slot._count.tokens === 0, deactivated: slot._count.tokens > 0 };
    });
  }

  // ─── Event assignments ────────────────────────────────────────────────

  async assignments(eventId: string, q: SearchPageQuery = {}) {
    const { page, pageSize, skip, take } = paging(q);
    const t = searchTerm(q.q);
    const where: Prisma.EventAssignmentWhereInput = {
      eventId,
      ...(t ? { user: { OR: [{ name: { contains: t, mode: 'insensitive' } }, { mobile: { contains: t } }, { email: { contains: t, mode: 'insensitive' } }] } } : {}),
    };
    const [rows, total] = await Promise.all([this.prisma.eventAssignment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip, take,
      select: {
        id: true, status: true, createdAt: true,
        user: { select: { id: true, name: true, mobile: true, email: true, status: true } },
        role: { select: { id: true, key: true, name: true } },
      },
    }), this.prisma.eventAssignment.count({ where })]);
    return paged(rows, total, page, pageSize);
  }

  /** Only people who already have some relationship with the mandal can be
   *  assigned — prevents probing the global user table by id. */
  async assertKnownToOrg(orgId: string, userId: string) {
    const known = await this.prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          { memberships: { some: { organizationId: orgId } } },
          { assignments: { some: { event: { organizationId: orgId } } } },
          { applications: { some: { organizationId: orgId } } },
        ],
      },
      select: { id: true },
    });
    if (!known) throw new NotFoundException('User not found in this mandal');
  }

  async assign(actor: RequestUser, actorPerms: Set<string>, orgId: string, eventId: string, dto: CreateAssignmentDto) {
    if (dto.userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot assign a role to yourself.', code: 'SELF_CHANGE' });
    await this.assertKnownToOrg(orgId, dto.userId);
    const role = await this.roles.findAssignable(orgId, dto.roleId);
    this.roles.assertCanGrant(actorPerms, role);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.eventAssignment.findUnique({ where: { eventId_userId: { eventId, userId: dto.userId } } });
      if (existing) throw new ConflictException({ message: 'This person is already assigned to the event.', code: 'ALREADY_ASSIGNED' });
      const a = await tx.eventAssignment.create({ data: { eventId, userId: dto.userId, roleId: role.id, assignedById: actor.id } });
      await this.audit.log({
        organizationId: orgId, eventId, actorId: actor.id, action: 'assignment.created', entityType: 'EventAssignment', entityId: a.id,
        after: { userId: dto.userId, role: role.key, status: a.status },
      }, tx);
      return a;
    });
  }

  private async targetAssignment(actor: RequestUser, actorPerms: Set<string>, eventId: string, assignmentId: string) {
    const a = await this.prisma.eventAssignment.findFirst({
      where: { id: assignmentId, eventId },
      include: { role: { include: { permissions: true } } },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot change your own assignment.', code: 'SELF_CHANGE' });
    this.roles.assertCanGrant(actorPerms, { id: a.role.id, key: a.role.key, name: a.role.name, permissions: a.role.permissions.map((p) => p.permissionKey) });
    return a;
  }

  async updateAssignment(actor: RequestUser, actorPerms: Set<string>, orgId: string, eventId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const a = await this.targetAssignment(actor, actorPerms, eventId, assignmentId);
    let roleId = a.roleId;
    let roleKey = a.role.key;
    if (dto.roleId && dto.roleId !== a.roleId) {
      const role = await this.roles.findAssignable(orgId, dto.roleId);
      this.roles.assertCanGrant(actorPerms, role);
      roleId = role.id;
      roleKey = role.key;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventAssignment.update({ where: { id: a.id }, data: { roleId, status: dto.status } });
      await this.audit.log({
        organizationId: orgId, eventId, actorId: actor.id, action: 'assignment.updated', entityType: 'EventAssignment', entityId: a.id,
        before: { userId: a.userId, role: a.role.key, status: a.status }, after: { userId: a.userId, role: roleKey, status: updated.status },
        reason: dto.reason,
      }, tx);
      return updated;
    });
  }

  async removeAssignment(actor: RequestUser, actorPerms: Set<string>, orgId: string, eventId: string, assignmentId: string) {
    const a = await this.targetAssignment(actor, actorPerms, eventId, assignmentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventAssignment.delete({ where: { id: a.id } });
      await this.audit.log({
        organizationId: orgId, eventId, actorId: actor.id, action: 'assignment.removed', entityType: 'EventAssignment', entityId: a.id,
        before: { userId: a.userId, role: a.role.key, status: a.status },
      }, tx);
    });
  }

}
