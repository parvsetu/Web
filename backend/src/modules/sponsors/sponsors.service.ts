import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sponsor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { CreateSponsorDto, UpdateSponsorDto } from './sponsors.dto';

const TIER_RANK: Record<string, number> = { TITLE: 0, PLATINUM: 1, GOLD: 2, SILVER: 3, PARTNER: 4 };
const MAX_LOGO = 300 * 1024;

/** Decodes and sniffs an uploaded logo; only real PNG/JPEG/WebP bytes are kept. */
export function parseLogo(dataUrl: string): { bytes: Buffer; type: string } {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new BadRequestException('Logo must be a PNG, JPEG or WebP image');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_LOGO) throw new BadRequestException('Logo must be 300 KB or smaller');
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const type = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : null;
  if (!type) throw new BadRequestException('The logo file is not a valid image');
  return { bytes, type };
}

export function presentSponsor(s: Sponsor) {
  return {
    id: s.id, eventId: s.eventId, name: s.name, tier: s.tier, tagline: s.tagline, bannerText: s.bannerText,
    websiteUrl: s.websiteUrl, isActive: s.isActive, sortOrder: s.sortOrder,
    logoUrl: s.logo ? `/public/sponsors/${s.id}/logo?v=${s.updatedAt.getTime()}` : null,
  };
}

@Injectable()
export class SponsorsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private sort(list: Sponsor[]) {
    return list.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async listForOrg(orgId: string) {
    return this.sort(await this.prisma.sponsor.findMany({ where: { organizationId: orgId } })).map(presentSponsor);
  }

  /** Active sponsors shown for one festival: its own + mandal-wide ones. */
  async forEvent(eventId: string) {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!ev) return [];
    const rows = await this.prisma.sponsor.findMany({
      where: { organizationId: ev.organizationId, isActive: true, OR: [{ eventId: null }, { eventId }] },
    });
    return this.sort(rows).map(({ ...s }) => {
      const { isActive: _a, sortOrder: _s, ...pub } = presentSponsor(s);
      return pub;
    });
  }

  private async assertEventInOrg(orgId: string, eventId?: string | null) {
    if (!eventId) return;
    const ev = await this.prisma.event.findFirst({ where: { id: eventId, organizationId: orgId }, select: { id: true } });
    if (!ev) throw new BadRequestException('That festival does not belong to this mandal');
  }

  async create(actor: RequestUser, orgId: string, dto: CreateSponsorDto) {
    await this.assertEventInOrg(orgId, dto.eventId);
    const logo = dto.logoDataUrl ? parseLogo(dto.logoDataUrl) : null;
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.sponsor.create({
        data: {
          organizationId: orgId, eventId: dto.eventId ?? null, name: dto.name.trim(), tier: dto.tier ?? 'PARTNER',
          tagline: dto.tagline?.trim() || null, bannerText: dto.bannerText?.trim() || null, websiteUrl: dto.websiteUrl || null,
          isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0,
          logo: logo?.bytes ?? null, logoType: logo?.type ?? null,
        },
      });
      await this.audit.log({ organizationId: orgId, eventId: s.eventId, actorId: actor.id, action: 'sponsor.created', entityType: 'Sponsor', entityId: s.id, after: presentSponsor(s) }, tx);
      return presentSponsor(s);
    });
  }

  async update(actor: RequestUser, orgId: string, id: string, dto: UpdateSponsorDto) {
    const before = await this.prisma.sponsor.findFirst({ where: { id, organizationId: orgId } });
    if (!before) throw new NotFoundException('Sponsor not found');
    if (dto.eventId !== undefined) await this.assertEventInOrg(orgId, dto.eventId);
    const logo = dto.logoDataUrl ? parseLogo(dto.logoDataUrl) : null;
    const data: Prisma.SponsorUncheckedUpdateInput = {
      name: dto.name?.trim(), tier: dto.tier, tagline: dto.tagline === undefined ? undefined : dto.tagline.trim() || null,
      bannerText: dto.bannerText === undefined ? undefined : dto.bannerText.trim() || null,
      websiteUrl: dto.websiteUrl === undefined ? undefined : dto.websiteUrl || null,
      eventId: dto.eventId === undefined ? undefined : dto.eventId, isActive: dto.isActive, sortOrder: dto.sortOrder,
      ...(logo ? { logo: logo.bytes, logoType: logo.type } : dto.removeLogo ? { logo: null, logoType: null } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.sponsor.update({ where: { id }, data });
      await this.audit.log({ organizationId: orgId, eventId: s.eventId, actorId: actor.id, action: 'sponsor.updated', entityType: 'Sponsor', entityId: id, before: presentSponsor(before), after: presentSponsor(s) }, tx);
      return presentSponsor(s);
    });
  }

  async remove(actor: RequestUser, orgId: string, id: string) {
    const s = await this.prisma.sponsor.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new NotFoundException('Sponsor not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.sponsor.delete({ where: { id } });
      await this.audit.log({ organizationId: orgId, eventId: s.eventId, actorId: actor.id, action: 'sponsor.deleted', entityType: 'Sponsor', entityId: id, before: presentSponsor(s) }, tx);
    });
  }

  async logo(id: string) {
    const s = await this.prisma.sponsor.findUnique({ where: { id }, select: { logo: true, logoType: true } });
    if (!s?.logo || !s.logoType) throw new NotFoundException('No logo');
    return { bytes: Buffer.from(s.logo), type: s.logoType };
  }
}
