import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
  PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { InstagramMedia, Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessService } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { decryptField, encryptField } from '../../common/crypto/field-crypto';
import { paged, paging } from '../../common/http';
import { brandedEmail, MailService } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import { GALLERY_QUOTA_BYTES, MAX_PHOTO_BYTES, imageInfo } from '../../common/images/image-info';
import { lockOrg, mb, storageUsage } from '../../common/images/quota';
import { INSTAGRAM_PROVIDER, InstagramProvider } from './instagram-provider';

/** How many recent posts a sync looks at. */
export const SYNC_MAX_POSTS = 60;
/** Photos shown in the landing page's Instagram section. */
export const LANDING_MAX_PHOTOS = 24;
const STATE_TTL_MS = 10 * 60_000;
const DAY = 86400_000;

export function presentMedia(m: InstagramMedia) {
  return {
    id: m.id, igMediaId: m.igMediaId, status: m.status, caption: m.caption, permalink: m.permalink, postedAt: m.postedAt,
    width: m.width, height: m.height, sizeBytes: m.sizeBytes, reviewedAt: m.reviewedAt,
    /** Authenticated: approved → the stored copy; pending → fetched fresh from Instagram (not stored). */
    imageUrl: `/organizations/${m.organizationId}/instagram/media/${m.id}/image`,
    publicUrl: m.status === 'APPROVED' ? `/public/instagram/${m.id}/image` : null,
  };
}

/**
 * Instagram photo import for a mandal's landing page.
 *
 *  - Connect: Instagram Login → long-lived token (encrypted). The OAuth `state`
 *    is HMAC-signed with the org, the user and an expiry, and the user must
 *    still hold SETTINGS_UPDATE on that mandal when Instagram sends them back.
 *    One Instagram account can be connected to one mandal.
 *  - Sync (on connect, on demand, and every few hours): new photo posts become
 *    PENDING rows (metadata only). Videos are skipped. Approved and rejected
 *    posts are never re-offered.
 *  - Approve: download a fresh copy, check format and size, store it under the
 *    mandal's 300 MB quota (org row lock), then APPROVED → shown on the landing
 *    page. Reject / hide: REJECTED, stored copy deleted.
 *  - Tokens are refreshed before they expire; an expired one asks for reconnect.
 */
@Injectable()
export class InstagramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Instagram');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly mail: MailService,
    @Inject(IMAGE_STORE) private readonly store: ImageStore,
    @Inject(INSTAGRAM_PROVIDER) private readonly provider: InstagramProvider | null,
  ) {}

  private requireProvider() {
    if (!this.provider) throw new ServiceUnavailableException({ statusCode: 503, code: 'INSTAGRAM_NOT_CONFIGURED', message: 'Instagram import isn’t switched on yet. Ask the Parvsetu team.' });
    return this.provider;
  }

  // ─── OAuth state ───────────────────────────────────────────────────

  private stateKey() {
    return `parvsetu-ig-state:${process.env.JWT_SECRET ?? 'dev'}`;
  }

  private signState(orgId: string, userId: string) {
    const body = Buffer.from(JSON.stringify({ o: orgId, u: userId, e: Date.now() + STATE_TTL_MS, n: randomBytes(8).toString('hex') })).toString('base64url');
    return `${body}.${createHmac('sha256', this.stateKey()).update(body).digest('base64url')}`;
  }

  private readState(state: string): { o: string; u: string } {
    const [body, sig] = (state ?? '').split('.');
    const want = body ? createHmac('sha256', this.stateKey()).update(body).digest('base64url') : '';
    if (!body || !sig || sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) {
      throw new BadRequestException({ statusCode: 400, code: 'INSTAGRAM_BAD_STATE', message: 'This Instagram link is not valid. Start again from the mandal’s Instagram tab.' });
    }
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { o: string; u: string; e: number };
    if (s.e < Date.now()) throw new BadRequestException({ statusCode: 400, code: 'INSTAGRAM_STATE_EXPIRED', message: 'That took too long. Start the Instagram connection again.' });
    return s;
  }

  // ─── Connection ────────────────────────────────────────────────────

  async status(orgId: string) {
    const [c, counts, usage] = await Promise.all([
      this.prisma.instagramConnection.findUnique({ where: { organizationId: orgId } }),
      this.prisma.instagramMedia.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
      storageUsage(this.prisma, orgId),
    ]);
    const n = (s: string) => counts.find((x) => x.status === s)?._count._all ?? 0;
    return {
      configured: !!this.provider, simulated: this.provider?.key === 'demo',
      connection: c && c.status !== 'DISCONNECTED'
        ? { username: c.username, profileUrl: `https://www.instagram.com/${c.username}/`, accountType: c.accountType, status: c.status, connectedAt: c.connectedAt, tokenExpiresAt: c.tokenExpiresAt, lastSyncAt: c.lastSyncAt, lastSyncError: c.lastSyncError }
        : null,
      counts: { pending: n('PENDING'), approved: n('APPROVED'), rejected: n('REJECTED') },
      usage,
    };
  }

  async connectUrl(user: RequestUser, orgId: string) {
    const p = this.requireProvider();
    return { url: p.authorizeUrl(this.signState(orgId, user.id)) };
  }

  /** Instagram sent the user back with a code: exchange it, store the token, run the first sync. */
  async callback(user: RequestUser, code: string, state: string) {
    const p = this.requireProvider();
    const s = this.readState(state);
    if (s.u !== user.id) throw new ForbiddenException({ statusCode: 403, code: 'INSTAGRAM_WRONG_USER', message: 'Log in as the person who started the Instagram connection.' });
    if (!(await this.access.orgPermissions(user, s.o)).has('SETTINGS_UPDATE')) {
      throw new ForbiddenException({ statusCode: 403, code: 'FORBIDDEN', message: 'You no longer manage this mandal’s settings.' });
    }
    const t = await p.exchangeCode(code);
    const other = await this.prisma.instagramConnection.findFirst({ where: { igUserId: t.igUserId, status: { not: 'DISCONNECTED' }, organizationId: { not: s.o } }, select: { organizationId: true } });
    if (other) throw new ConflictException({ statusCode: 409, code: 'INSTAGRAM_IN_USE', message: `@${t.username} is already connected to another mandal on Parvsetu.` });
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.instagramConnection.findUnique({ where: { organizationId: s.o } });
      // A different account replaces the old one: its unapproved posts go; approved photos stay until hidden.
      if (before && before.igUserId !== t.igUserId) await tx.instagramMedia.deleteMany({ where: { organizationId: s.o, status: { not: 'APPROVED' } } });
      const data = {
        igUserId: t.igUserId, username: t.username, accountType: t.accountType, accessTokenEnc: encryptField(t.accessToken), tokenExpiresAt: t.expiresAt,
        status: 'ACTIVE' as const, connectedById: user.id, connectedAt: new Date(), lastSyncError: null,
      };
      if (before) await tx.instagramConnection.update({ where: { organizationId: s.o }, data });
      else await tx.instagramConnection.create({ data: { organizationId: s.o, ...data } });
      await this.audit.log({ organizationId: s.o, actorId: user.id, action: 'instagram.connected', entityType: 'InstagramConnection', entityId: s.o, before: before ? { username: before.username, status: before.status } : null, after: { username: t.username, accountType: t.accountType } }, tx);
    });
    const sync = await this.sync(s.o, user.id);
    return { organizationId: s.o, username: t.username, ...sync };
  }

  async disconnect(actor: RequestUser, orgId: string, removePhotos: boolean) {
    const c = await this.prisma.instagramConnection.findUnique({ where: { organizationId: orgId } });
    if (!c || c.status === 'DISCONNECTED') throw new NotFoundException('Instagram is not connected.');
    await this.prisma.$transaction(async (tx) => {
      const keys = removePhotos ? (await tx.instagramMedia.findMany({ where: { organizationId: orgId, imageKey: { not: null } }, select: { imageKey: true } })).map((m) => m.imageKey) : [];
      await tx.instagramMedia.deleteMany({ where: { organizationId: orgId, ...(removePhotos ? {} : { status: { not: 'APPROVED' } }) } });
      await this.store.delete(keys, tx);
      await tx.instagramConnection.update({ where: { organizationId: orgId }, data: { status: 'DISCONNECTED', accessTokenEnc: null, tokenExpiresAt: null } });
      await this.audit.log({ organizationId: orgId, actorId: actor.id, action: 'instagram.disconnected', entityType: 'InstagramConnection', entityId: orgId, after: { username: c.username, photosRemoved: removePhotos } }, tx);
    });
    return this.status(orgId);
  }

  private token(c: { accessTokenEnc: string | null }) {
    if (!c.accessTokenEnc) throw new ConflictException({ statusCode: 409, code: 'INSTAGRAM_NOT_CONNECTED', message: 'Connect Instagram first.' });
    return decryptField(c.accessTokenEnc);
  }

  private async activeConnection(orgId: string) {
    const c = await this.prisma.instagramConnection.findUnique({ where: { organizationId: orgId } });
    if (!c || c.status === 'DISCONNECTED') throw new ConflictException({ statusCode: 409, code: 'INSTAGRAM_NOT_CONNECTED', message: 'Connect Instagram first.' });
    if (c.status === 'EXPIRED' || (c.tokenExpiresAt && c.tokenExpiresAt <= new Date())) {
      if (c.status !== 'EXPIRED') await this.prisma.instagramConnection.update({ where: { organizationId: orgId }, data: { status: 'EXPIRED' } });
      throw new ConflictException({ statusCode: 409, code: 'INSTAGRAM_EXPIRED', message: 'The Instagram connection has expired. Connect it again.' });
    }
    return c;
  }

  // ─── Sync ──────────────────────────────────────────────────────────

  /** New photo posts → PENDING. Returns how many were added. Never re-offers approved / rejected posts. */
  async sync(orgId: string, actorId: string | null) {
    const p = this.requireProvider();
    const c = await this.activeConnection(orgId);
    let items;
    try {
      items = await p.recentMedia(this.token(c), SYNC_MAX_POSTS);
    } catch (e) {
      await this.prisma.instagramConnection.update({ where: { organizationId: orgId }, data: { lastSyncAt: new Date(), lastSyncError: e instanceof Error ? e.message.slice(0, 300) : 'Sync failed' } });
      throw e;
    }
    const photos = items.filter((m) => m.mediaType === 'IMAGE');
    const res = await this.prisma.instagramMedia.createMany({
      data: photos.map((m) => ({ organizationId: orgId, igMediaId: m.igMediaId, parentIgId: m.parentIgId, caption: m.caption?.slice(0, 2200) ?? null, permalink: m.permalink, postedAt: m.postedAt })),
      skipDuplicates: true,
    });
    await this.prisma.instagramConnection.update({ where: { organizationId: orgId }, data: { lastSyncAt: new Date(), lastSyncError: null } });
    if (actorId && res.count) await this.audit.log({ organizationId: orgId, actorId, action: 'instagram.synced', entityType: 'InstagramConnection', entityId: orgId, after: { added: res.count } });
    return { added: res.count, skippedVideos: items.length - photos.length, pending: await this.prisma.instagramMedia.count({ where: { organizationId: orgId, status: 'PENDING' } }) };
  }

  async list(orgId: string, q: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 30);
    const where: Prisma.InstagramMediaWhereInput = { organizationId: orgId, status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.instagramMedia.findMany({ where, orderBy: [{ postedAt: 'desc' }, { igMediaId: 'asc' }], skip, take }),
      this.prisma.instagramMedia.count({ where }),
    ]);
    return paged(rows.map(presentMedia), total, page, pageSize);
  }

  private async findMedia(orgId: string, id: string) {
    const m = await this.prisma.instagramMedia.findFirst({ where: { id, organizationId: orgId } }).catch(() => null);
    if (!m) throw new NotFoundException('Photo not found');
    return m;
  }

  /** Staff view: the stored copy once approved; before that a fresh copy from Instagram (not kept). */
  async image(orgId: string, id: string) {
    const m = await this.findMedia(orgId, id);
    if (m.imageKey) {
      const img = await this.store.get(m.imageKey);
      if (img) return img;
    }
    if (m.status === 'REJECTED') throw new NotFoundException('Photo not found');
    const p = this.requireProvider();
    const c = await this.activeConnection(orgId);
    const url = await p.mediaUrl(this.token(c), m.igMediaId);
    if (!url) throw new NotFoundException('This post is no longer on Instagram.');
    const bytes = await p.download(url);
    return { bytes, mimeType: imageInfo(bytes, 'Instagram photo').type };
  }

  /**
   * Approves photos one by one (each in its own transaction: org lock → quota
   * → store → conditional PENDING→APPROVED). Returns per-photo results so one
   * failure (deleted post, too large, quota) doesn't hide the others.
   */
  async approve(actor: RequestUser, orgId: string, ids: string[]) {
    const p = this.requireProvider();
    const c = await this.activeConnection(orgId);
    const token = this.token(c);
    const results: { id: string; ok: boolean; error?: string; code?: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        const m = await this.findMedia(orgId, id);
        if (m.status !== 'PENDING') throw new ConflictException({ statusCode: 409, code: 'NOT_PENDING', message: m.status === 'APPROVED' ? 'Already on the page.' : 'This photo was rejected.' });
        const url = await p.mediaUrl(token, m.igMediaId);
        if (!url) throw new NotFoundException({ statusCode: 404, code: 'INSTAGRAM_POST_GONE', message: 'This post is no longer on Instagram.' });
        const bytes = await p.download(url);
        if (bytes.length > MAX_PHOTO_BYTES) throw new PayloadTooLargeException({ statusCode: 413, code: 'PHOTO_TOO_LARGE', message: `The photo is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.` });
        const info = imageInfo(bytes, 'Instagram photo');
        await this.prisma.$transaction(async (tx) => {
          await lockOrg(tx, orgId);
          const { usedBytes } = await storageUsage(tx, orgId);
          if (usedBytes + bytes.length > GALLERY_QUOTA_BYTES) {
            throw new PayloadTooLargeException({ statusCode: 413, code: 'GALLERY_QUOTA_EXCEEDED', message: `Not enough photo space: ${mb(usedBytes)} of ${mb(GALLERY_QUOTA_BYTES)} used. Delete some photos first.` });
          }
          const key = await this.store.put({ prefix: `org/${orgId}/instagram`, organizationId: orgId, bytes, mimeType: info.type }, tx);
          const moved = await tx.instagramMedia.updateMany({
            where: { id, organizationId: orgId, status: 'PENDING' },
            data: { status: 'APPROVED', imageKey: key, mimeType: info.type, width: info.width, height: info.height, sizeBytes: bytes.length, reviewedById: actor.id, reviewedAt: new Date() },
          });
          if (moved.count !== 1) throw new ConflictException({ statusCode: 409, code: 'NOT_PENDING', message: 'Someone else reviewed this photo just now.' });
        }, { timeout: 20_000 });
        results.push({ id, ok: true });
      } catch (e) {
        const r = e as { getResponse?: () => { message?: string; code?: string } | string; message?: string };
        const body = r.getResponse?.();
        results.push({ id, ok: false, error: typeof body === 'object' ? body?.message : body ?? r.message ?? 'Failed', code: typeof body === 'object' ? body?.code : undefined });
      }
    }
    const ok = results.filter((r) => r.ok).map((r) => r.id);
    if (ok.length) await this.audit.log({ organizationId: orgId, actorId: actor.id, action: 'instagram.photos_approved', entityType: 'InstagramMedia', after: { ids: ok } });
    return { results, status: await this.status(orgId) };
  }

  /** Rejects pending photos, or hides approved ones (their stored copy is deleted). Either way they aren't offered again. */
  async reject(actor: RequestUser, orgId: string, ids: string[]) {
    const rows = await this.prisma.instagramMedia.findMany({ where: { organizationId: orgId, id: { in: [...new Set(ids)] }, status: { not: 'REJECTED' } } });
    if (!rows.length) throw new NotFoundException('No such photos.');
    await this.prisma.$transaction(async (tx) => {
      await tx.instagramMedia.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'REJECTED', imageKey: null, mimeType: null, width: null, height: null, sizeBytes: 0, reviewedById: actor.id, reviewedAt: new Date() },
      });
      await this.store.delete(rows.map((r) => r.imageKey), tx);
      await this.audit.log({ organizationId: orgId, actorId: actor.id, action: 'instagram.photos_rejected', entityType: 'InstagramMedia', after: { ids: rows.map((r) => r.id), hidden: rows.filter((r) => r.status === 'APPROVED').length } }, tx);
    });
    return this.status(orgId);
  }

  /** Puts rejected / hidden photos back in the review queue. */
  async restore(actor: RequestUser, orgId: string, ids: string[]) {
    const r = await this.prisma.instagramMedia.updateMany({ where: { organizationId: orgId, id: { in: ids }, status: 'REJECTED' }, data: { status: 'PENDING', reviewedById: actor.id, reviewedAt: new Date() } });
    if (!r.count) throw new NotFoundException('No rejected photos to restore.');
    return this.status(orgId);
  }

  // ─── Public (landing page) ─────────────────────────────────────────

  /** Approved photos for the landing page's Instagram section (null when there are none). */
  async landingBlock(orgId: string) {
    const [c, rows] = await Promise.all([
      this.prisma.instagramConnection.findUnique({ where: { organizationId: orgId }, select: { username: true, status: true } }),
      this.prisma.instagramMedia.findMany({ where: { organizationId: orgId, status: 'APPROVED' }, orderBy: [{ postedAt: 'desc' }, { igMediaId: 'asc' }], take: LANDING_MAX_PHOTOS }),
    ]);
    if (!rows.length) return null;
    return {
      username: c && c.status !== 'DISCONNECTED' ? c.username : null,
      profileUrl: c && c.status !== 'DISCONNECTED' ? `https://www.instagram.com/${c.username}/` : null,
      photos: rows.map((m) => ({ id: m.id, url: `/public/instagram/${m.id}/image`, width: m.width, height: m.height, caption: m.caption, permalink: m.permalink, postedAt: m.postedAt })),
    };
  }

  async publicImage(id: string) {
    const m = await this.prisma.instagramMedia.findFirst({ where: { id, status: 'APPROVED' }, select: { imageKey: true } }).catch(() => null);
    const img = m?.imageKey ? await this.store.get(m.imageKey) : null;
    if (!img) throw new NotFoundException('Photo not found');
    return img;
  }

  // ─── Meta platform callbacks (deauthorize / data deletion) ─────────

  /** Verifies Meta's signed_request (HMAC-SHA256 with the app secret) and returns its payload. */
  parseSignedRequest(signed: string | undefined): { user_id?: string } {
    const secret = process.env.INSTAGRAM_APP_SECRET;
    const [sig, payload] = (signed ?? '').split('.');
    if (!secret || !sig || !payload) throw new BadRequestException('Invalid signed_request');
    const want = createHmac('sha256', secret).update(payload).digest('base64url');
    if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) throw new BadRequestException('Invalid signed_request');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  }

  /** The person removed Parvsetu from their Instagram: stop using the token (approved photos stay until a mandal admin hides them). */
  async deauthorize(signed: string | undefined) {
    const { user_id } = this.parseSignedRequest(signed);
    if (!user_id) return { ok: true };
    const rows = await this.prisma.instagramConnection.findMany({ where: { igUserId: String(user_id), status: { not: 'DISCONNECTED' } } });
    for (const c of rows) {
      await this.prisma.$transaction(async (tx) => {
        await tx.instagramMedia.deleteMany({ where: { organizationId: c.organizationId, status: { not: 'APPROVED' } } });
        await tx.instagramConnection.update({ where: { organizationId: c.organizationId }, data: { status: 'DISCONNECTED', accessTokenEnc: null, tokenExpiresAt: null } });
        await this.audit.log({ organizationId: c.organizationId, action: 'instagram.deauthorized', entityType: 'InstagramConnection', entityId: c.organizationId, after: { username: c.username } }, tx);
      });
    }
    return { ok: true };
  }

  /** Data-deletion request: everything we hold from that Instagram account goes, including approved copies. */
  async deleteData(signed: string | undefined) {
    const { user_id } = this.parseSignedRequest(signed);
    const code = randomBytes(8).toString('hex');
    if (user_id) {
      const rows = await this.prisma.instagramConnection.findMany({ where: { igUserId: String(user_id) } });
      for (const c of rows) {
        await this.prisma.$transaction(async (tx) => {
          const keys = (await tx.instagramMedia.findMany({ where: { organizationId: c.organizationId, imageKey: { not: null } }, select: { imageKey: true } })).map((m) => m.imageKey);
          await tx.instagramMedia.deleteMany({ where: { organizationId: c.organizationId } });
          await this.store.delete(keys, tx);
          await tx.instagramConnection.delete({ where: { organizationId: c.organizationId } });
          await this.audit.log({ organizationId: c.organizationId, action: 'instagram.data_deleted', entityType: 'InstagramConnection', entityId: c.organizationId, after: { confirmationCode: code } }, tx);
        });
      }
    }
    return { url: `${siteUrl()}/legal/privacy`, confirmation_code: code };
  }

  // ─── Background: token refresh + periodic sync ─────────────────────

  /** Refreshes tokens expiring within 15 days; marks expired ones; syncs connections not synced for 12 h and emails the admin about new photos. */
  async housekeeping() {
    if (!this.provider) return;
    const now = Date.now();
    const due = await this.prisma.instagramConnection.findMany({ where: { status: 'ACTIVE' } });
    for (const c of due) {
      try {
        if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() <= now) {
          await this.prisma.instagramConnection.update({ where: { organizationId: c.organizationId }, data: { status: 'EXPIRED' } });
          continue;
        }
        if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() - now < 15 * DAY && now - c.connectedAt.getTime() > DAY) {
          const t = await this.provider.refresh(this.token(c));
          await this.prisma.instagramConnection.update({ where: { organizationId: c.organizationId }, data: { accessTokenEnc: encryptField(t.accessToken), tokenExpiresAt: t.expiresAt } });
        }
        if (!c.lastSyncAt || now - c.lastSyncAt.getTime() > 12 * 3600_000) {
          const r = await this.sync(c.organizationId, null);
          if (r.added > 0) await this.notify(c.organizationId, c.connectedById, r.added, c.username);
        }
      } catch (e) {
        this.log.warn(`Instagram housekeeping for ${c.organizationId} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  private async notify(orgId: string, userId: string, added: number, username: string) {
    const [u, org] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, status: true } }),
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ]);
    if (!u?.email || u.status !== 'ACTIVE' || !org) return;
    await this.mail.send({
      to: u.email,
      ...brandedEmail({
        subject: `${added} new Instagram photo${added === 1 ? '' : 's'} to review — ${org.name}`,
        title: 'New photos from Instagram',
        name: u.name,
        paragraphs: [`We found ${added} new photo${added === 1 ? '' : 's'} on @${username}. Choose which ones to show on ${org.name}’s page — nothing appears until you approve it.`],
        cta: { label: 'Review photos', url: `${siteUrl()}/org/${orgId}#instagram` },
      }),
    });
  }

  private timer?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && this.provider) {
      this.timer = setInterval(() => void this.housekeeping().catch(() => undefined), 3 * 3600_000);
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
