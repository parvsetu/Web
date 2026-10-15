import { BadGatewayException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { deflateSync } from 'zlib';
import { siteUrl } from '../../common/site-url';

/**
 * Instagram boundary. The service only talks to this interface, so the real
 * Meta API and the simulated one (dev/tests) are interchangeable — like the
 * payment providers.
 *
 * Real: "Instagram API with Instagram Login" (Business / Creator accounts,
 * scope instagram_business_basic). Needs INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET
 * from a Meta app that passed app review; the redirect URI registered there
 * must be `${SITE_URL}/instagram/callback`.
 */
export interface IgProfile {
  igUserId: string;
  username: string;
  accountType: string | null;
}

export interface IgToken {
  accessToken: string;
  expiresAt: Date;
}

export interface IgMediaItem {
  igMediaId: string;
  parentIgId: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption: string | null;
  permalink: string | null;
  postedAt: Date | null;
  mediaUrl: string | null;
}

export interface InstagramProvider {
  readonly key: 'meta' | 'demo';
  authorizeUrl(state: string): string;
  /** Code from the redirect → a long-lived token (~60 days) and the account. */
  exchangeCode(code: string): Promise<IgToken & IgProfile>;
  /** Extends a long-lived token (allowed once it is ≥ 24 h old and not expired). */
  refresh(accessToken: string): Promise<IgToken>;
  /** Most recent posts, newest first; carousels are expanded into their image children. */
  recentMedia(accessToken: string, max: number): Promise<IgMediaItem[]>;
  /** A fresh (unexpired) media URL for one image. */
  mediaUrl(accessToken: string, igMediaId: string): Promise<string | null>;
  download(url: string): Promise<Buffer>;
}

export const INSTAGRAM_PROVIDER = Symbol('INSTAGRAM_PROVIDER');
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

export const redirectUri = () => `${siteUrl()}/instagram/callback`;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; error_message?: string };
    if (!res.ok) {
      const msg = typeof body.error === 'object' ? body.error?.message : body.error_message ?? body.error;
      throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_ERROR', message: `Instagram said: ${msg ?? res.statusText}` });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export class MetaInstagramProvider implements InstagramProvider {
  readonly key = 'meta';
  private readonly graph = process.env.INSTAGRAM_GRAPH_BASE ?? 'https://graph.instagram.com';

  constructor(private readonly appId: string, private readonly appSecret: string) {}

  authorizeUrl(state: string) {
    const q = new URLSearchParams({ client_id: this.appId, redirect_uri: redirectUri(), response_type: 'code', scope: 'instagram_business_basic', state });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  }

  async exchangeCode(code: string) {
    const short = await getJson<{ access_token: string; user_id: string | number }>('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.appId, client_secret: this.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri(), code: code.replace(/#_$/, '') }),
    });
    const long = await getJson<{ access_token: string; expires_in: number }>(
      `${this.graph}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: this.appSecret, access_token: short.access_token })}`,
    );
    const me = await getJson<{ user_id?: string; id?: string; username: string; account_type?: string }>(
      `${this.graph}/me?${new URLSearchParams({ fields: 'user_id,username,account_type', access_token: long.access_token })}`,
    );
    return {
      accessToken: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000),
      igUserId: String(me.user_id ?? me.id ?? short.user_id), username: me.username, accountType: me.account_type ?? null,
    };
  }

  async refresh(accessToken: string) {
    const r = await getJson<{ access_token: string; expires_in: number }>(
      `${this.graph}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })}`,
    );
    return { accessToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  }

  async recentMedia(accessToken: string, max: number) {
    type Raw = { id: string; caption?: string; media_type: IgMediaItem['mediaType']; media_url?: string; permalink?: string; timestamp?: string; children?: { data: { id: string; media_type: IgMediaItem['mediaType']; media_url?: string }[] } };
    const out: IgMediaItem[] = [];
    let url: string | null = `${this.graph}/me/media?${new URLSearchParams({ fields: 'id,caption,media_type,media_url,permalink,timestamp,children{id,media_type,media_url}', limit: '25', access_token: accessToken })}`;
    while (url && out.length < max) {
      const page: { data: Raw[]; paging?: { next?: string } } = await getJson(url);
      for (const m of page.data) {
        const base = { caption: m.caption ?? null, permalink: m.permalink ?? null, postedAt: m.timestamp ? new Date(m.timestamp) : null };
        if (m.media_type === 'CAROUSEL_ALBUM' && m.children?.data.length) {
          for (const c of m.children.data) out.push({ ...base, igMediaId: c.id, parentIgId: m.id, mediaType: c.media_type, mediaUrl: c.media_url ?? null });
        } else {
          out.push({ ...base, igMediaId: m.id, parentIgId: null, mediaType: m.media_type, mediaUrl: m.media_url ?? null });
        }
      }
      url = page.paging?.next ?? null;
    }
    return out.slice(0, max);
  }

  async mediaUrl(accessToken: string, igMediaId: string) {
    const r = await getJson<{ media_url?: string }>(`${this.graph}/${encodeURIComponent(igMediaId)}?${new URLSearchParams({ fields: 'media_url', access_token: accessToken })}`);
    return r.media_url ?? null;
  }

  /** Only Instagram / Facebook CDN hosts over https (no SSRF), capped size. */
  async download(url: string) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)) {
      throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_BAD_MEDIA_URL', message: 'Instagram returned an unexpected image address.' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      if (!res.ok) throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_DOWNLOAD_FAILED', message: 'Could not download the photo from Instagram. Try again.' });
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_DOWNLOAD_BYTES) throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_IMAGE_TOO_LARGE', message: 'That Instagram photo is too large to import.' });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_DOWNLOAD_BYTES) throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_IMAGE_TOO_LARGE', message: 'That Instagram photo is too large to import.' });
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Simulated Instagram (INSTAGRAM_DEMO=true, never in production) ───────

const DEMO_POSTS: { id: string; caption: string; type: IgMediaItem['mediaType']; color: [number, number, number]; children?: { id: string; color: [number, number, number] }[] }[] = [
  { id: 'demo_post_1', caption: 'Ganpati Bappa Morya! Our pandal on day one 🙏', type: 'IMAGE', color: [234, 88, 12] },
  { id: 'demo_post_2', caption: 'Aarti at dusk', type: 'CAROUSEL_ALBUM', color: [0, 0, 0], children: [{ id: 'demo_post_2a', color: [217, 119, 6] }, { id: 'demo_post_2b', color: [190, 18, 60] }] },
  { id: 'demo_post_3', caption: 'Dhol tasha practice — video', type: 'VIDEO', color: [30, 64, 175] },
  { id: 'demo_post_4', caption: 'Volunteers who made it happen', type: 'IMAGE', color: [13, 148, 136] },
  { id: 'demo_post_5', caption: 'Rangoli competition winners', type: 'IMAGE', color: [126, 34, 206] },
];

export class DemoInstagramProvider implements InstagramProvider {
  readonly key = 'demo';

  authorizeUrl(state: string) {
    return `${siteUrl()}/instagram/demo-authorize?${new URLSearchParams({ state })}`;
  }

  async exchangeCode(code: string) {
    if (!/^demo_[a-z0-9]{6,40}$/.test(code)) throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_ERROR', message: 'Instagram said: invalid authorization code' });
    const tag = createHash('sha256').update(code).digest('hex').slice(0, 6);
    return { accessToken: `demo_token_${randomBytes(12).toString('hex')}`, expiresAt: new Date(Date.now() + 60 * 86400_000), igUserId: `demo_${tag}`, username: `demo.mandal.${tag}`, accountType: 'BUSINESS' };
  }

  async refresh(accessToken: string) {
    return { accessToken, expiresAt: new Date(Date.now() + 60 * 86400_000) };
  }

  async recentMedia(_accessToken: string, max: number) {
    const day = 86400_000;
    const out: IgMediaItem[] = [];
    DEMO_POSTS.forEach((p, i) => {
      const base = { caption: p.caption, permalink: `https://www.instagram.com/p/${p.id}/`, postedAt: new Date(Date.UTC(2026, 8, 20) - i * day) };
      if (p.children) for (const c of p.children) out.push({ ...base, igMediaId: c.id, parentIgId: p.id, mediaType: 'IMAGE', mediaUrl: `demo://${c.id}` });
      else out.push({ ...base, igMediaId: p.id, parentIgId: null, mediaType: p.type, mediaUrl: `demo://${p.id}` });
    });
    return out.slice(0, max);
  }

  async mediaUrl(_accessToken: string, igMediaId: string) {
    return `demo://${igMediaId}`;
  }

  async download(url: string) {
    const id = url.replace(/^demo:\/\//, '');
    const post = DEMO_POSTS.flatMap((p) => [{ id: p.id, color: p.color }, ...(p.children ?? [])]).find((p) => p.id === id);
    if (!post) throw new BadGatewayException({ statusCode: 502, code: 'INSTAGRAM_DOWNLOAD_FAILED', message: 'Could not download the photo from Instagram. Try again.' });
    return solidPng(480, 480, post.color);
  }
}

/** A valid solid-colour PNG (the simulated Instagram's "photos"). */
export function solidPng(w: number, h: number, [r, g, b]: [number, number, number]) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let CRC_TABLE: number[] | null = null;
function crc32(buf: Buffer) {
  CRC_TABLE ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Real provider when keys are set; the simulated one only when INSTAGRAM_DEMO=true; otherwise none (feature off). */
export function buildInstagramProvider(): InstagramProvider | null {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (id && secret) return new MetaInstagramProvider(id, secret);
  if (process.env.INSTAGRAM_DEMO === 'true') return new DemoInstagramProvider();
  return null;
}
