import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FESTIVAL_GROUPS, FestivalCatalogService } from '../../common/catalog/festival-catalog.service';
import { FESTIVAL_TYPES } from '../../common/festival-types';
import { BillingService, rupees, toPaise } from '../billing/billing.service';
import { EventFeeRateDto, UpdateCustomTypeDto } from './registrations.dto';

/** Super admin: per-festival-type / per-group event fees and the custom festival types. */
@Injectable()
export class CatalogAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly billing: BillingService, private readonly catalog: FestivalCatalogService) {}

  async feeRates() {
    const [s, rates, types] = await Promise.all([this.billing.settings(), this.prisma.eventFeeRate.findMany(), this.catalog.list()]);
    const rate = (scope: string, key: string) => {
      const r = rates.find((x) => x.scope === scope && x.key === key);
      return r ? rupees(r.feePaise) : null;
    };
    return {
      defaultFee: rupees(s.defaultEventFeePaise),
      groups: FESTIVAL_GROUPS.map((g) => ({ group: g, fee: rate('GROUP', g) })),
      types: types.map((t) => ({ key: t.key, label: t.label, group: t.group, custom: !!t.custom, fee: rate('TYPE', t.key) })),
    };
  }

  async setFeeRate(actorId: string, dto: EventFeeRateDto) {
    if (dto.scope === 'GROUP' && !(FESTIVAL_GROUPS as string[]).includes(dto.key)) throw new BadRequestException('Unknown festival category');
    if (dto.scope === 'TYPE' && !FESTIVAL_TYPES.some((f) => f.key === dto.key) && !(await this.prisma.customFestivalType.findUnique({ where: { key: dto.key } }))) {
      throw new BadRequestException('Unknown festival type');
    }
    const before = await this.prisma.eventFeeRate.findUnique({ where: { scope_key: { scope: dto.scope, key: dto.key } } });
    await this.prisma.$transaction(async (tx) => {
      if (dto.fee === null) await tx.eventFeeRate.deleteMany({ where: { scope: dto.scope, key: dto.key } });
      else await tx.eventFeeRate.upsert({ where: { scope_key: { scope: dto.scope, key: dto.key } }, create: { scope: dto.scope, key: dto.key, feePaise: toPaise(dto.fee) }, update: { feePaise: toPaise(dto.fee) } });
      await this.audit.log({
        actorId, action: 'event_fee.rate_updated', entityType: 'EventFeeRate', entityId: `${dto.scope}:${dto.key}`,
        before: before ? { fee: rupees(before.feePaise) } : null, after: dto.fee === null ? null : { fee: dto.fee },
      }, tx);
    });
    return this.feeRates();
  }

  async customTypes() {
    const rows = await this.prisma.customFestivalType.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: rows.map((r) => r.organizationId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, organization: orgs.find((o) => o.id === r.organizationId) ?? null }));
  }

  async updateCustomType(actorId: string, key: string, dto: UpdateCustomTypeDto) {
    const before = await this.prisma.customFestivalType.findUnique({ where: { key } });
    if (!before) throw new NotFoundException('Custom festival type not found');
    if (dto.inCatalog && (dto.status ?? before.status) !== 'APPROVED') throw new BadRequestException('Approve the type before adding it to the catalog.');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.customFestivalType.update({
        where: { key },
        data: { inCatalog: dto.inCatalog, label: dto.label?.trim(), status: dto.status, reviewedById: actorId, reviewedAt: new Date(), ...(dto.status === 'REJECTED' ? { inCatalog: false } : {}) },
      });
      await this.audit.log({ actorId, action: 'festival_type.custom_updated', entityType: 'CustomFestivalType', entityId: key, before, after }, tx);
      return after;
    });
  }
}
