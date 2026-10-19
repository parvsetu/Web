import { BadRequestException } from '@nestjs/common';

/** What kind of programme item it is (drives the badge colour and the filter chips). */
export const PROGRAMME_CATEGORIES = ['PERFORMANCE', 'PUJA', 'CULTURAL', 'COMPETITION', 'CHIEF_GUEST', 'WORKSHOP', 'OTHER'] as const;
export type ProgrammeCategory = (typeof PROGRAMME_CATEGORIES)[number];

/** Indoor / outdoor tag, like activity listings. null = not said. */
export const PROGRAMME_SETTINGS = ['INDOOR', 'OUTDOOR'] as const;

export const PROGRAMME_STATUSES = ['SCHEDULED', 'CANCELLED'] as const;

export const MAX_ITEMS_PER_EVENT = 200;
export const MAX_GUESTS_PER_ITEM = 10;

export interface VideoLink {
  provider: 'YOUTUBE' | 'INSTAGRAM';
  /** Canonical watch URL (what we store). */
  url: string;
  /** Iframe URL for an in-page player. */
  embedUrl: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;

function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * A YouTube or Instagram (reel / post) link → its canonical URL and embed URL.
 * Anything else is null: we only embed players from these two hosts.
 */
export function videoLink(raw: string | null | undefined): VideoLink | null {
  const u = raw ? parseUrl(raw.trim()) : null;
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  let ytId: string | null = null;
  if (host === 'youtu.be') ytId = parts[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') ytId = u.searchParams.get('v');
    else if (['shorts', 'live', 'embed'].includes(parts[0] ?? '')) ytId = parts[1] ?? null;
  }
  if (ytId && YT_ID.test(ytId)) {
    return { provider: 'YOUTUBE', url: `https://www.youtube.com/watch?v=${ytId}`, embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}` };
  }
  if (host === 'instagram.com') {
    const kind = parts[0] === 'reels' ? 'reel' : parts[0];
    const code = parts[1];
    if ((kind === 'reel' || kind === 'p' || kind === 'tv') && code && IG_CODE.test(code)) {
      return { provider: 'INSTAGRAM', url: `https://www.instagram.com/${kind}/${code}/`, embedUrl: `https://www.instagram.com/${kind}/${code}/embed` };
    }
  }
  return null;
}

/** For writes: '' / null clears, a supported link is normalised, anything else is a 400. */
export function normaliseVideoUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const v = videoLink(raw);
  if (!v) throw new BadRequestException('Video link must be a YouTube video/short or an Instagram reel/post link.');
  return v.url;
}

const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** "@falgunipathak", "instagram.com/falgunipathak" or the full URL → https://www.instagram.com/<handle>/. */
export function normaliseInstagramProfile(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  let handle: string | null = null;
  if (s.startsWith('@')) handle = s.slice(1);
  else if (IG_HANDLE.test(s)) handle = s;
  else {
    const u = parseUrl(s);
    const host = u?.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (u && host === 'instagram.com') handle = u.pathname.split('/').filter(Boolean)[0] ?? null;
  }
  if (!handle || !IG_HANDLE.test(handle) || ['p', 'reel', 'reels', 'tv', 'explore', 'stories'].includes(handle.toLowerCase())) {
    throw new BadRequestException('Instagram must be a handle like @artistname or an instagram.com profile link.');
  }
  return `https://www.instagram.com/${handle}/`;
}

/** Every calendar date of a festival, 'YYYY-MM-DD', inclusive. */
export function festivalDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end && out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
