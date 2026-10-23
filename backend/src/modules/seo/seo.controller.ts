import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { AuditService } from '../../common/audit/audit.service';
import { PageQuery, paged, paging } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { SEO_KINDS, SEO_LANGS, normaliseKey, type SeoKind } from './seo.rules';

class SeoListQuery extends PageQuery {
  @IsOptional() @IsIn(SEO_KINDS) kind?: SeoKind;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class UpsertSeoPageDto {
  @IsIn(SEO_KINDS) kind!: SeoKind;
  /** City slug or category key; ignored for HOME. */
  @IsOptional() @IsString() @MaxLength(80) key?: string;
  @IsIn(SEO_LANGS) lang!: (typeof SEO_LANGS)[number];
  /** City display name ("Navi Mumbai"). */
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
  @IsOptional() @IsString() @MaxLength(2000) aboveText?: string;
  @IsOptional() @IsString() @MaxLength(20000) belowText?: string;
  @IsBoolean() published!: boolean;
}

const blank = (v: string | undefined) => {
  const t = v?.replace(/\r\n/g, '\n').trim();
  return t ? t : null;
};

const PUBLIC_SELECT = { kind: true, key: true, lang: true, name: true, title: true, metaDescription: true, aboveText: true, belowText: true, updatedAt: true } as const;

/** Super admin: write the SEO text for the home, city and category pages. */
@SuperAdminOnly()
@Controller('platform/seo-pages')
export class SeoAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list(@Query() q: SeoListQuery) {
    const { page, pageSize, skip, take } = paging(q, 30);
    const t = q.q?.trim();
    const where: Prisma.SeoPageWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(t ? { OR: [{ key: { contains: t, mode: 'insensitive' } }, { name: { contains: t, mode: 'insensitive' } }, { title: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.seoPage.findMany({ where, orderBy: [{ kind: 'asc' }, { key: 'asc' }, { lang: 'asc' }], skip, take }),
      this.prisma.seoPage.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  /** Create or replace the page for kind + key + language. */
  @Put()
  async upsert(@CurrentUser() user: RequestUser, @Body() dto: UpsertSeoPageDto) {
    const key = normaliseKey(dto.kind, dto.key);
    if (key === null) {
      throw new BadRequestException(dto.kind === 'CATEGORY' ? 'Choose one of the explore categories.' : 'City address must be lower-case letters, digits and hyphens, e.g. navi-mumbai.');
    }
    const data = {
      name: dto.kind === 'CITY' ? blank(dto.name) : null,
      title: blank(dto.title), metaDescription: blank(dto.metaDescription),
      aboveText: blank(dto.aboveText), belowText: blank(dto.belowText),
      published: dto.published, updatedById: user.id,
    };
    const where = { kind_key_lang: { kind: dto.kind, key, lang: dto.lang } };
    const before = await this.prisma.seoPage.findUnique({ where });
    const page = await this.prisma.seoPage.upsert({ where, create: { kind: dto.kind, key, lang: dto.lang, ...data }, update: data });
    await this.audit.log({ actorId: user.id, action: before ? 'seo_page.update' : 'seo_page.create', entityType: 'SeoPage', entityId: page.id, after: { kind: page.kind, key: page.key, lang: page.lang, published: page.published } });
    return page;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const page = await this.prisma.seoPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('SEO page not found');
    await this.prisma.seoPage.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, action: 'seo_page.delete', entityType: 'SeoPage', entityId: id, before: { kind: page.kind, key: page.key, lang: page.lang } });
    return { ok: true };
  }
}

/** Published SEO text for the public site (the language asked for, else English). */
@Public()
@Controller('public/seo-pages')
export class SeoPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':kind/:key')
  async get(@Param('kind') kindParam: string, @Param('key') keyParam: string, @Query('lang') lang?: string) {
    const kind = kindParam.toUpperCase() as SeoKind;
    if (!(SEO_KINDS as readonly string[]).includes(kind)) throw new NotFoundException();
    const key = normaliseKey(kind, keyParam === '_' ? '' : keyParam);
    if (key === null) throw new NotFoundException();
    const langs = lang && lang !== 'en' && (SEO_LANGS as readonly string[]).includes(lang) ? [lang, 'en'] : ['en'];
    const rows = await this.prisma.seoPage.findMany({ where: { kind, key, lang: { in: langs }, published: true }, select: PUBLIC_SELECT });
    const page = langs.map((l) => rows.find((r) => r.lang === l)).find(Boolean);
    if (!page) throw new NotFoundException();
    return page;
  }
}
