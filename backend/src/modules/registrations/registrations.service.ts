import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { MandalRegistration, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { FestivalCatalogService } from '../../common/catalog/festival-catalog.service';
import { DECLARATION_VERSION } from '../../common/legal';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { brandedEmail, MailService } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { dateOnly, ymd } from '../../common/time/validity';
import { BCRYPT_ROUNDS, AuthService } from '../auth/auth.service';
import { maskEmail, OtpService } from '../auth/otp.service';
import { BillingService, rupees, toPaise } from '../billing/billing.service';
import { stateOrThrow } from '../organizations/organizations.service';
import { EventFeeService, payUrl, presentFeePayment } from './event-fee.service';
import { activateRegistrations } from './activate';
import {
  AgentRegistrationDto, ApproveRegistrationDto, MandalDetailsDto, MyRegistrationDto, RegistrationEventDto, RegistrationListQuery, SelfRegistrationDto,
} from './registrations.dto';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** What a registration stores for each requested festival (the snapshot the super admin reviews). */
export interface RequestedEvent {
  festivalType: string | null;
  custom: { name: string; group: string; description: string | null } | null;
  name: string;
  startDate: string;
  endDate: string;
  location: string | null;
  venueAddress: string | null;
  quotedFeePaise: number;
  feeSource: string;
}

export const SET_PASSWORD_HOURS = 72;

export function assertDeclaration(accepted: boolean | undefined) {
  if (accepted !== true) {
    throw new BadRequestException({
      statusCode: 400, code: 'DECLARATION_REQUIRED',
      message: 'Please tick the declaration: no liquor, gambling or other illegal activity, and all required permissions (police, municipal corporation, fire, sound) obtained.',
    });
  }
}

const registrationInclude = {
  agent: { select: { id: true, name: true, code: true } },
  organization: { select: { id: true, name: true, slug: true } },
} as const;
type RegistrationRow = Prisma.MandalRegistrationGetPayload<{ include: typeof registrationInclude }>;

/**
 * Mandal registration: nothing is published until the super admin approves the
 * mandal and each event's registration fee is paid. A registration is filed by
 * the mandal itself (public form → email code → PENDING_REVIEW), by a logged-in
 * user, or by a field agent on the mandal's behalf (the contact receives a
 * set-password link). Approval creates the Organization, makes the applicant
 * Mandal Admin, sets its allowed festival types and creates the requested
 * events as APPROVED_AWAITING_PAYMENT with their pay links.
 */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: FestivalCatalogService,
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly fees: EventFeeService,
    private readonly billing: BillingService,
  ) {}

  // ─── Building a registration ───────────────────────────────────────

  /** Validates the requested festivals and quotes each one's fee (platform rates; no mandal override yet). */
  private async requestedEvents(events: RegistrationEventDto[]): Promise<RequestedEvent[]> {
    const out: RequestedEvent[] = [];
    for (const e of events) {
      if (e.endDate < e.startDate) throw new BadRequestException(`“${e.name}”: the end date must be on or after the start date.`);
      let type: string | null = null;
      if (!e.custom) {
        const entry = await this.catalog.find(e.festivalType!);
        if (!entry || (entry.custom && !(entry.inCatalog && entry.status === 'APPROVED'))) {
          throw new BadRequestException({ message: `Unknown festival type ${e.festivalType}. Pick one from the list or choose “My event isn’t listed”.`, code: 'UNKNOWN_FESTIVAL_TYPE' });
        }
        type = entry.key;
      }
      // A custom event is quoted by its chosen category (group rate), else the default.
      const q = type ? await this.fees.quote(this.prisma, null, type) : await this.groupQuote(e.custom!.group);
      out.push({
        festivalType: type,
        custom: e.custom ? { name: e.custom.name.trim(), group: e.custom.group, description: e.custom.description?.trim() || null } : null,
        name: e.name.trim(), startDate: e.startDate, endDate: e.endDate,
        location: e.location?.trim() || null, venueAddress: e.venueAddress?.trim() || null,
        quotedFeePaise: q.feePaise, feeSource: q.source,
      });
    }
    return out;
  }

  private async groupQuote(group: string) {
    const [s, rate] = await Promise.all([this.billing.settings(), this.prisma.eventFeeRate.findUnique({ where: { scope_key: { scope: 'GROUP', key: group } } })]);
    return rate ? { feePaise: rate.feePaise, source: 'GROUP' } : { feePaise: s.defaultEventFeePaise, source: 'DEFAULT' };
  }

  private async referralAgent(code?: string) {
    const c = code?.trim().toUpperCase();
    if (!c) return null;
    const agent = await this.prisma.agent.findUnique({ where: { code: c }, select: { id: true, status: true } });
    if (!agent || agent.status !== 'ACTIVE') throw new BadRequestException({ message: 'That referral code is not valid. Check it with your agent, or leave it empty.', code: 'INVALID_REFERRAL_CODE' });
    return agent.id;
  }

  private async assertFreeIdentity(mobile: string, email: string) {
    if (await this.prisma.user.findUnique({ where: { mobile } })) {
      throw new ConflictException({ message: 'An account with this mobile number already exists. Log in and register the mandal from there.', code: 'MOBILE_TAKEN' });
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({ message: 'An account with this email already exists. Log in and register the mandal from there.', code: 'EMAIL_TAKEN' });
    }
  }

  private registrationData(dto: MandalDetailsDto, events: RequestedEvent[]) {
    return {
      orgName: dto.orgName.trim(), state: stateOrThrow(dto.state) ?? null, city: dto.city?.trim() || null, address: dto.address?.trim() || null,
      events: events as unknown as Prisma.InputJsonValue,
    };
  }

  private declaration(tx: Prisma.TransactionClient, registrationId: string, acceptedById: string, meta: RequestMeta, onBehalf = false) {
    return tx.legalDeclaration.create({
      data: { version: DECLARATION_VERSION, context: 'REGISTRATION', registrationId, acceptedById, onBehalf, ipAddress: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    });
  }

  /** Public form: creates the applicant's (locked) account + the registration; an email code activates both. */
  async createSelf(dto: SelfRegistrationDto, meta: RequestMeta) {
    assertDeclaration(dto.declarationAccepted);
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email)!;
    await this.assertFreeIdentity(mobile, email);
    const agentId = await this.referralAgent(dto.referralCode);
    const events = await this.requestedEvents(dto.events);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const { user, reg } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.contactName.trim(), mobile, email, passwordHash, requiresEmailVerification: true } });
      const r = await tx.mandalRegistration.create({
        data: {
          ...this.registrationData(dto, events), status: 'PENDING_VERIFICATION', source: 'SELF',
          contactName: dto.contactName.trim(), contactMobile: mobile, contactEmail: email, applicantUserId: u.id,
          agentId, referralCode: dto.referralCode?.trim().toUpperCase() || null, createdById: u.id,
        },
      });
      await this.declaration(tx, r.id, u.id, meta);
      await this.audit.log({ actorId: u.id, action: 'registration.created', entityType: 'MandalRegistration', entityId: r.id, after: { orgName: r.orgName, source: 'SELF', events: events.length, agentId } }, tx);
      return { user: u, reg: r };
    });
    try {
      await this.otp.issue({ id: user.id, name: user.name, email }, 'VERIFY_EMAIL');
    } catch (e) {
      if (!(e instanceof HttpException && e.getStatus() === 429)) throw e;
    }
    return { verificationRequired: true, email, maskedEmail: maskEmail(email), registrationId: reg.id };
  }

  /** A logged-in user registering a mandal they run (their account becomes the applicant). */
  async createForUser(actor: RequestUser, dto: MyRegistrationDto, meta: RequestMeta) {
    if (actor.partnerId || actor.agentId) throw new ForbiddenException({ statusCode: 403, code: 'FORBIDDEN', message: 'Partner and agent accounts can’t apply for a mandal themselves.' });
    assertDeclaration(dto.declarationAccepted);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.email || !user.emailVerifiedAt) throw new BadRequestException({ message: 'Verify your email in My profile first — we send registration updates there.', code: 'EMAIL_NOT_VERIFIED' });
    const open = await this.prisma.mandalRegistration.findFirst({ where: { applicantUserId: actor.id, status: { in: ['PENDING_VERIFICATION', 'PENDING_REVIEW', 'CHANGES_REQUESTED'] } }, select: { id: true } });
    if (open) throw new ConflictException({ message: 'You already have a mandal registration under review.', code: 'REGISTRATION_PENDING' });
    const agentId = await this.referralAgent(dto.referralCode);
    const events = await this.requestedEvents(dto.events);
    const reg = await this.prisma.$transaction(async (tx) => {
      const r = await tx.mandalRegistration.create({
        data: {
          ...this.registrationData(dto, events), status: 'PENDING_REVIEW', source: 'SELF', submittedAt: new Date(),
          contactName: user.name, contactMobile: user.mobile, contactEmail: user.email!, applicantUserId: user.id,
          agentId, referralCode: dto.referralCode?.trim().toUpperCase() || null, createdById: user.id,
        },
      });
      await this.declaration(tx, r.id, user.id, meta);
      await this.audit.log({ actorId: user.id, action: 'registration.created', entityType: 'MandalRegistration', entityId: r.id, after: { orgName: r.orgName, source: 'SELF', events: events.length, agentId } }, tx);
      return r;
    });
    return this.present(await this.load(reg.id), { withEvents: true });
  }

  /**
   * A field agent files for a mandal. The contact's account is created locked
   * (unusable random password) and receives a single-use set-password link —
   * setting the password also proves the email. Goes straight to review: the
   * agent met the mandal in person and declared on its behalf.
   */
  async createByAgent(actor: RequestUser, agentId: string, dto: AgentRegistrationDto, meta: RequestMeta) {
    assertDeclaration(dto.declarationAccepted);
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email)!;
    await this.assertFreeIdentity(mobile, email);
    const events = await this.requestedEvents(dto.events);
    const placeholder = await bcrypt.hash(randomBytes(24).toString('hex'), BCRYPT_ROUNDS);
    const token = randomBytes(32).toString('base64url');
    const reg = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.contactName.trim(), mobile, email, passwordHash: placeholder, requiresEmailVerification: true } });
      await tx.passwordSetupToken.create({ data: { userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SET_PASSWORD_HOURS * 3600_000) } });
      const r = await tx.mandalRegistration.create({
        data: {
          ...this.registrationData(dto, events), status: 'PENDING_REVIEW', source: 'AGENT', submittedAt: new Date(),
          contactName: dto.contactName.trim(), contactMobile: mobile, contactEmail: email, applicantUserId: u.id, agentId, createdById: actor.id,
        },
      });
      await this.declaration(tx, r.id, actor.id, meta, true);
      await this.audit.log({ actorId: actor.id, action: 'registration.created', entityType: 'MandalRegistration', entityId: r.id, after: { orgName: r.orgName, source: 'AGENT', events: events.length, agentId } }, tx);
      return r;
    });
    const agent = await this.prisma.agent.findUniqueOrThrow({ where: { id: agentId }, select: { name: true } });
    await this.mail.send({ to: email, ...setPasswordEmail(dto.contactName.trim(), dto.orgName.trim(), agent.name, `${siteUrl()}/set-password?token=${token}`) });
    return this.present(await this.load(reg.id), { withEvents: true });
  }

  /** Single-use set-password link → password set, email verified, signed in. */
  async setPassword(token: string, password: string) {
    const row = await this.prisma.passwordSetupToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status !== 'ACTIVE') {
      throw new BadRequestException({ message: 'This link is invalid or has expired. Use “Forgot password” on the login page to get a code instead.', code: 'INVALID_LINK' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const won = await tx.passwordSetupToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (won.count !== 1) throw new BadRequestException({ message: 'This link was already used.', code: 'INVALID_LINK' });
      const u = await tx.user.update({ where: { id: row.userId }, data: { passwordHash, emailVerifiedAt: row.user.emailVerifiedAt ?? new Date(), tokenVersion: { increment: 1 } } });
      await activateRegistrations(tx, u.id);
      return u;
    });
    return { accessToken: this.auth.sign(user.id, user.tokenVersion), user: await this.auth.me({ id: user.id, name: user.name, isSuperAdmin: user.isSuperAdmin, partnerId: user.partnerId, agentId: user.agentId }) };
  }

  // ─── Applicant ─────────────────────────────────────────────────────

  async mine(actor: RequestUser) {
    const rows = await this.prisma.mandalRegistration.findMany({ where: { applicantUserId: actor.id }, include: registrationInclude, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((r) => this.present(r, { withEvents: true })));
  }

  async updateMine(actor: RequestUser, id: string, dto: MandalDetailsDto, meta: RequestMeta) {
    assertDeclaration(dto.declarationAccepted);
    const r = await this.prisma.mandalRegistration.findFirst({ where: { id, applicantUserId: actor.id } });
    if (!r) throw new NotFoundException('Registration not found');
    if (r.status !== 'CHANGES_REQUESTED') throw new ConflictException({ message: 'Only a registration sent back for changes can be edited.', code: 'REGISTRATION_LOCKED' });
    const events = await this.requestedEvents(dto.events);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.mandalRegistration.updateMany({
        where: { id, status: 'CHANGES_REQUESTED' },
        data: { ...this.registrationData(dto, events), status: 'PENDING_REVIEW', submittedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ message: 'This registration changed meanwhile. Reload and try again.', code: 'REGISTRATION_LOCKED' });
      await this.declaration(tx, id, actor.id, meta);
      await this.audit.log({ actorId: actor.id, action: 'registration.resubmitted', entityType: 'MandalRegistration', entityId: id, before: { status: r.status, reviewNote: r.reviewNote }, after: { status: 'PENDING_REVIEW' } }, tx);
    });
    return this.present(await this.load(id), { withEvents: true });
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async list(q: RegistrationListQuery, extra: Prisma.MandalRegistrationWhereInput = {}) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.MandalRegistrationWhereInput = {
      ...extra,
      status: q.status as MandalRegistration['status'] | undefined,
      ...(t ? { OR: [{ orgName: { contains: t, mode: 'insensitive' } }, { city: { contains: t, mode: 'insensitive' } }, { contactName: { contains: t, mode: 'insensitive' } }, { contactMobile: { contains: t } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.mandalRegistration.findMany({ where, include: registrationInclude, orderBy: { createdAt: q.status === 'PENDING_REVIEW' ? 'asc' : 'desc' }, skip, take }),
      this.prisma.mandalRegistration.count({ where }),
    ]);
    return paged(await Promise.all(rows.map((r) => this.present(r, { withEvents: true }))), total, page, pageSize);
  }

  async get(id: string) {
    const r = await this.load(id);
    const declarations = await this.prisma.legalDeclaration.findMany({ where: { registrationId: id }, orderBy: { acceptedAt: 'desc' } });
    return { ...(await this.present(r, { withEvents: true })), declarations: declarations.map((d) => ({ version: d.version, acceptedAt: d.acceptedAt, acceptedById: d.acceptedById, onBehalf: d.onBehalf, ipAddress: d.ipAddress })) };
  }

  private async load(id: string) {
    const r = await this.prisma.mandalRegistration.findUnique({ where: { id }, include: registrationInclude });
    if (!r) throw new NotFoundException('Registration not found');
    return r;
  }

  async requestChanges(actorId: string, id: string, note: string) {
    return this.review(actorId, id, 'CHANGES_REQUESTED', note, 'registration.changes_requested');
  }

  async reject(actorId: string, id: string, reason: string) {
    return this.review(actorId, id, 'REJECTED', reason, 'registration.rejected');
  }

  private async review(actorId: string, id: string, to: 'CHANGES_REQUESTED' | 'REJECTED', note: string, action: string) {
    const r = await this.load(id);
    const from = to === 'REJECTED' ? ['PENDING_REVIEW', 'CHANGES_REQUESTED', 'PENDING_VERIFICATION'] : ['PENDING_REVIEW'];
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.mandalRegistration.updateMany({
        where: { id, status: { in: from as MandalRegistration['status'][] } },
        data: { status: to, reviewNote: note.trim(), reviewedById: actorId, reviewedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ message: `A ${r.status.toLowerCase().replace(/_/g, ' ')} registration can’t be ${to === 'REJECTED' ? 'rejected' : 'sent back'}.`, code: 'REGISTRATION_LOCKED' });
      await this.audit.log({ actorId, action, entityType: 'MandalRegistration', entityId: id, before: { status: r.status }, after: { status: to }, reason: note.trim() }, tx);
    });
    await this.mail.send({
      to: r.contactEmail,
      ...brandedEmail({
        subject: to === 'REJECTED' ? `Your Parvsetu registration for ${r.orgName}` : `Changes needed: ${r.orgName} on Parvsetu`,
        title: to === 'REJECTED' ? 'Registration not approved' : 'A few changes are needed',
        name: r.contactName,
        paragraphs: [to === 'REJECTED' ? `We could not approve ${r.orgName}.` : `The Parvsetu team reviewed ${r.orgName} and needs a few changes before approving it.`, `Note from the team: ${note.trim()}`],
        cta: { label: 'Open my registration', url: `${siteUrl()}/registration` },
      }),
    });
    return this.present(await this.load(id), { withEvents: true });
  }

  /**
   * Approves a registration in one transaction: Organization (+ billing account),
   * applicant → Mandal Admin, allowed festival types, custom types approved
   * (optionally added to the catalog), and each requested event created as
   * APPROVED_AWAITING_PAYMENT with its fee locked and a pay link — or LIVE
   * straight away when its fee is 0.
   */
  async approve(actorId: string, id: string, dto: ApproveRegistrationDto) {
    const extra = [...new Set(dto.extraFestivalTypes ?? [])];
    await this.catalog.assertKnown(extra);
    const adminRole = await this.prisma.role.findFirstOrThrow({ where: { organizationId: null, key: 'MANDAL_ADMIN' }, select: { id: true } });
    const orgId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM mandal_registrations WHERE id = ${id} FOR UPDATE`;
      const r = await tx.mandalRegistration.findUnique({ where: { id }, include: { applicant: true } });
      if (!r) throw new NotFoundException('Registration not found');
      if (r.status !== 'PENDING_REVIEW') throw new ConflictException({ message: `Only a registration waiting for review can be approved (this one is ${r.status.toLowerCase().replace(/_/g, ' ')}).`, code: 'REGISTRATION_LOCKED' });
      if (r.applicant.partnerId || r.applicant.agentId) throw new ConflictException({ message: 'The applicant account is a partner/agent account.', code: 'APPLICANT_INVALID' });
      const requested = r.events as unknown as RequestedEvent[];
      const choice = new Map((dto.events ?? []).map((c) => [c.index, c]));
      for (const idx of choice.keys()) if (idx >= requested.length) throw new BadRequestException(`There is no requested event #${idx}.`);

      const slug = dto.slug ?? (await uniqueSlug(tx, r.orgName));
      if (await tx.organization.findUnique({ where: { slug } })) throw new ConflictException({ message: 'That web address (slug) is taken.', code: 'SLUG_TAKEN' });
      const org = await tx.organization.create({
        data: { name: r.orgName, slug, state: r.state, city: r.city, address: r.address, agentId: r.agentId, agentAttributedAt: r.agentId ? new Date() : null },
      });
      await this.billing.ensureAccount(tx, org.id);
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: r.applicantUserId } },
        create: { organizationId: org.id, userId: r.applicantUserId, roleId: adminRole.id },
        update: { roleId: adminRole.id, status: 'ACTIVE' },
      });

      const decl = await tx.legalDeclaration.findFirst({ where: { registrationId: id }, orderBy: { acceptedAt: 'desc' } });
      const types: string[] = [];
      const created: { name: string; feePaise: number; paymentToken: string | null }[] = [];
      const now = new Date();
      for (const [i, e] of requested.entries()) {
        const c = choice.get(i);
        let key = e.festivalType;
        if (e.custom) {
          key = await this.catalog.newCustomKey(e.custom.name, tx);
          await tx.customFestivalType.create({
            data: {
              key, label: e.custom.name, group: e.custom.group, description: e.custom.description, defaultPrefix: this.catalog.prefixFor(key),
              status: 'APPROVED', inCatalog: !!c?.addToCatalog, organizationId: org.id, registrationId: id, createdById: r.applicantUserId,
              reviewedById: actorId, reviewedAt: now,
            },
          });
        }
        types.push(key!);
        const feePaise = c?.fee !== undefined ? toPaise(c.fee) : e.quotedFeePaise;
        const live = feePaise === 0;
        const ev = await tx.event.create({
          data: {
            organizationId: org.id, name: e.name, festivalType: key!, location: e.location, venueAddress: e.venueAddress,
            startDate: dateOnly(e.startDate), endDate: dateOnly(e.endDate), timezone: 'Asia/Kolkata', state: r.state, city: r.city,
            status: live ? 'ACTIVE' : 'DRAFT', approvalStatus: live ? 'LIVE' : 'APPROVED_AWAITING_PAYMENT', tokenPrefix: this.catalog.prefixFor(key!),
            feeQuotedPaise: e.quotedFeePaise, feePaise, feeSource: c?.fee !== undefined ? 'ADMIN' : e.feeSource,
            submittedAt: r.submittedAt ?? r.createdAt, reviewedAt: now, reviewedById: actorId, liveAt: live ? now : null, registrationId: id,
          },
        });
        if (decl) {
          await tx.legalDeclaration.create({
            data: { version: decl.version, context: 'REGISTRATION', registrationId: id, eventId: ev.id, acceptedById: decl.acceptedById, onBehalf: decl.onBehalf, ipAddress: decl.ipAddress, userAgent: decl.userAgent, acceptedAt: decl.acceptedAt },
          });
        }
        const p = live ? null : await this.fees.openLink(tx, ev, feePaise, actorId);
        created.push({ name: ev.name, feePaise, paymentToken: p?.token ?? null });
      }
      await tx.organization.update({ where: { id: org.id }, data: { festivalTypes: [...new Set([...types, ...extra])] } });
      await tx.mandalRegistration.update({ where: { id }, data: { status: 'APPROVED', organizationId: org.id, reviewedById: actorId, reviewedAt: now, reviewNote: null } });
      await this.audit.log({
        organizationId: org.id, actorId, action: 'registration.approved', entityType: 'MandalRegistration', entityId: id,
        before: { status: r.status }, after: { status: 'APPROVED', organizationId: org.id, slug, festivalTypes: [...new Set([...types, ...extra])], events: created.map((c) => ({ name: c.name, fee: rupees(c.feePaise) })) },
      }, tx);
      return { orgId: org.id, created, contact: { email: r.contactEmail, name: r.contactName }, orgName: r.orgName };
    });
    await this.mail.send({ to: orgId.contact.email, ...approvedEmail(orgId.contact.name, orgId.orgName, orgId.created) });
    return this.get(id);
  }

  // ─── Presenting ────────────────────────────────────────────────────

  async present(r: RegistrationRow, opts: { withEvents?: boolean } = {}) {
    const requested = r.events as unknown as RequestedEvent[];
    const events = opts.withEvents && r.organizationId
      ? await this.prisma.event.findMany({
        where: { registrationId: r.id }, orderBy: { startDate: 'asc' },
        include: { feePayments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      })
      : [];
    return {
      id: r.id, status: r.status, source: r.source, orgName: r.orgName, state: r.state, city: r.city, address: r.address,
      contactName: r.contactName, contactMobile: r.contactMobile, contactEmail: r.contactEmail, referralCode: r.referralCode,
      agent: r.agent, organization: r.organization, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt, submittedAt: r.submittedAt, createdAt: r.createdAt,
      requestedEvents: requested.map((e, index) => ({ index, ...e, quotedFee: rupees(e.quotedFeePaise), quotedFeePaise: undefined })),
      events: events.map((e) => ({
        id: e.id, name: e.name, festivalType: e.festivalType, startDate: ymd(e.startDate), endDate: ymd(e.endDate),
        approvalStatus: e.approvalStatus, status: e.status, fee: e.feePaise !== null ? rupees(e.feePaise) : null,
        payment: e.feePayments[0] ? presentFeePayment(e.feePayments[0]) : null,
      })),
    };
  }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function uniqueSlug(tx: Prisma.TransactionClient, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'mandal';
  let slug = base;
  for (let i = 2; await tx.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

function setPasswordEmail(name: string, orgName: string, agentName: string, url: string) {
  return brandedEmail({
    subject: `Set your Parvsetu password — ${orgName}`,
    title: 'Your mandal registration is in',
    name,
    paragraphs: [
      `${agentName}, a Parvsetu field agent, has registered ${orgName} on Parvsetu for you. The Parvsetu team will now review it.`,
      'Set a password to sign in, follow the review and pay for your festivals once approved. This also confirms your email address.',
    ],
    cta: { label: 'Set my password', url },
    footer: `The link works once, for ${SET_PASSWORD_HOURS} hours. Didn't expect this? You can ignore the email.`,
  });
}

function approvedEmail(name: string, orgName: string, events: { name: string; feePaise: number; paymentToken: string | null }[]) {
  const unpaid = events.filter((e) => e.paymentToken);
  return brandedEmail({
    subject: `${orgName} is approved on Parvsetu 🎉`,
    title: 'Your mandal is approved',
    name,
    paragraphs: [
      `${orgName} is now on Parvsetu and you are its Mandal Admin. You can set up time slots, venue, pricing and volunteers right away.`,
      ...(unpaid.length
        ? ['Each festival goes live once its registration fee is paid:', ...unpaid.map((e) => `• ${e.name} — ₹${rupees(e.feePaise)}: ${payUrl(e.paymentToken!)}`)]
        : ['Your festivals are live.']),
    ],
    cta: { label: 'Open Parvsetu', url: `${siteUrl()}/registration` },
  });
}
