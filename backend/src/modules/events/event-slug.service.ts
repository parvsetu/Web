import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { isUuid, normaliseSlug, slugCandidates, slugProblem, withYear } from '../../common/event-slug';

type Db = Prisma.TransactionClient | PrismaService;
/** Just the tables slug lookups need — also satisfied by a plain PrismaClient (the seed). */
type SlugDb = Pick<Prisma.TransactionClient, 'event' | 'eventSlugAlias'>;

/** Taken by another festival (as its address or one of its old ones)? */
async function takenByOther(db: SlugDb, slug: string, eventId: string | null) {
  const [ev, alias] = await Promise.all([
    db.event.findUnique({ where: { slug }, select: { id: true } }),
    db.eventSlugAlias.findUnique({ where: { slug }, select: { eventId: true } }),
  ]);
  return (!!ev && ev.id !== eventId) || (!!alias && alias.eventId !== eventId);
}

/**
 * First free address for a festival: name + year, then mandal + name + year, then numbered.
 * A plain function so any module creating events (registrations, seed) can use it inside its transaction.
 */
export async function suggestEventSlug(db: SlugDb, eventName: string, orgName: string, year: number, eventId: string | null = null) {
  for (const c of slugCandidates(eventName, orgName, year)) {
    if (!(await takenByOther(db, c, eventId))) return c;
  }
  return `${withYear(normaliseSlug(eventName) || 'festival', year)}-${Date.now().toString(36)}`;
}

/** Festival page addresses (/f/<slug>): checking, choosing, resolving. Rules in common/event-slug.ts. */
@Injectable()
export class EventSlugService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private takenByOther(db: Db, slug: string, eventId: string | null) {
    return takenByOther(db, slug, eventId);
  }

  async suggest(db: Db, eventName: string, orgName: string, year: number, eventId: string | null = null) {
    return suggestEventSlug(db, eventName, orgName, year, eventId);
  }

  private async event(eventId: string) {
    const e = await this.prisma.event.findUnique({
      where: { id: eventId }, select: { id: true, name: true, slug: true, startDate: true, organizationId: true, organization: { select: { name: true } } },
    });
    if (!e) throw new NotFoundException('Festival not found');
    return e;
  }

  /** Live check while the organiser types: normalised form, valid?, free?, and a suggestion. */
  async check(eventId: string, raw: string) {
    const e = await this.event(eventId);
    const year = e.startDate.getUTCFullYear();
    const slug = normaliseSlug(raw ?? '');
    const problem = slugProblem(slug, year);
    const taken = !problem && (await this.takenByOther(this.prisma, slug, e.id));
    const fixed = slug && !problem ? slug : withYear(slug || normaliseSlug(e.name), year);
    const suggestion = !slugProblem(fixed, year) && !(await this.takenByOther(this.prisma, fixed, e.id))
      ? fixed
      : await this.suggest(this.prisma, e.name, e.organization.name, year, e.id);
    return {
      slug, current: e.slug, year,
      valid: !problem, available: !problem && !taken,
      reason: problem ?? (taken ? 'Another festival already uses this address.' : null),
      suggestion: suggestion === slug ? null : suggestion,
    };
  }

  /** Sets the address; the old one becomes an alias so shared links keep working. */
  async set(actor: RequestUser, eventId: string, raw: string) {
    const e = await this.event(eventId);
    const year = e.startDate.getUTCFullYear();
    const slug = normaliseSlug(raw ?? '');
    const problem = slugProblem(slug, year);
    if (problem) throw new BadRequestException({ statusCode: 400, code: 'SLUG_INVALID', message: problem });
    if (slug === e.slug) return { slug };
    try {
      await this.prisma.$transaction(async (tx) => {
        if (await this.takenByOther(tx, slug, e.id)) {
          throw new ConflictException({ statusCode: 409, code: 'SLUG_TAKEN', message: 'Another festival already uses this address. Try adding your mandal or area name.' });
        }
        // Taking back one of our own old addresses: it stops being an alias.
        await tx.eventSlugAlias.deleteMany({ where: { slug, eventId: e.id } });
        if (e.slug) await tx.eventSlugAlias.upsert({ where: { slug: e.slug }, create: { slug: e.slug, eventId: e.id }, update: {} });
        await tx.event.update({ where: { id: e.id }, data: { slug } });
        await this.audit.log({ organizationId: e.organizationId, eventId: e.id, actorId: actor.id, action: 'event.slug_changed', entityType: 'Event', entityId: e.id, before: { slug: e.slug }, after: { slug } }, tx);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, code: 'SLUG_TAKEN', message: 'Another festival already uses this address.' });
      }
      throw err;
    }
    return { slug };
  }

  /** Festival id for an id, current slug or old slug; null when unknown. */
  async resolve(idOrSlug: string): Promise<string | null> {
    if (isUuid(idOrSlug)) return idOrSlug;
    const slug = idOrSlug.toLowerCase();
    const ev = await this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (ev) return ev.id;
    const alias = await this.prisma.eventSlugAlias.findUnique({ where: { slug }, select: { eventId: true } });
    return alias?.eventId ?? null;
  }

  /** Gives every festival without an address one (older festivals; run by the seed on each start). */
  async backfill() {
    const rows = await this.prisma.event.findMany({ where: { slug: null }, select: { id: true, name: true, startDate: true, organization: { select: { name: true } } }, take: 500 });
    for (const r of rows) {
      const slug = await this.suggest(this.prisma, r.name, r.organization.name, r.startDate.getUTCFullYear(), r.id);
      await this.prisma.event.updateMany({ where: { id: r.id, slug: null }, data: { slug } }).catch(() => undefined);
    }
    return rows.length;
  }
}
