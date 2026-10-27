import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PushSubscription } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptField, encryptField } from '../../common/crypto/field-crypto';
import { siteUrl } from '../../common/site-url';
import { DateTime } from 'luxon';
import { PushSubscriptionDto } from './push.dto';

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped (a path on the website). */
  url: string;
  /** Same tag = a newer notification replaces the older one on the phone. */
  tag?: string;
}

/** Reminders go out this long before a pass's time window starts. */
export const REMINDER_LEAD_HOURS = 3;
const LANGS = ['en', 'hi', 'mr', 'bn', 'or', 'kn'] as const;

/** The pass reminder in the visitor's site language. */
const REMINDER: Record<(typeof LANGS)[number], (event: string, from: string, until: string) => { title: string; body: string }> = {
  en: (e, f, u) => ({ title: `Your pass for ${e}`, body: `Today ${f}–${u}. Open your pass at the gate — it works without internet too.` }),
  hi: (e, f, u) => ({ title: `${e} के लिए आपका पास`, body: `आज ${f}–${u}। गेट पर अपना पास खोलें — यह बिना इंटरनेट के भी चलता है।` }),
  mr: (e, f, u) => ({ title: `${e} साठी तुमचा पास`, body: `आज ${f}–${u}. गेटवर तुमचा पास उघडा — तो इंटरनेटशिवायही चालतो.` }),
  bn: (e, f, u) => ({ title: `${e}-এর জন্য আপনার পাস`, body: `আজ ${f}–${u}। গেটে আপনার পাস খুলুন — ইন্টারনেট ছাড়াও কাজ করে।` }),
  or: (e, f, u) => ({ title: `${e} ପାଇଁ ଆପଣଙ୍କ ପାସ୍`, body: `ଆଜି ${f}–${u}। ଗେଟରେ ଆପଣଙ୍କ ପାସ୍ ଖୋଲନ୍ତୁ — ଇଣ୍ଟରନେଟ୍ ବିନା ମଧ୍ୟ କାମ କରେ।` }),
  kn: (e, f, u) => ({ title: `${e} ಗಾಗಿ ನಿಮ್ಮ ಪಾಸ್`, body: `ಇಂದು ${f}–${u}. ಗೇಟಿನಲ್ಲಿ ನಿಮ್ಮ ಪಾಸ್ ತೆರೆಯಿರಿ — ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.` }),
};

/**
 * Web push (works on iPhone once Parvsetu is on the home screen, iOS 16.4+,
 * and in Chrome / Android / desktop). The VAPID key pair is created by the API
 * itself on first use and kept in the database (private key encrypted), so
 * there is nothing to configure. Sending is always best-effort: a failed push
 * never fails the action that triggered it, and subscriptions the push service
 * reports as gone are deleted.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Push');
  private keyCache: { publicKey: string; privateKey: string } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async keys() {
    if (this.keyCache) return this.keyCache;
    let row = await this.prisma.pushKeys.findUnique({ where: { id: 'default' } });
    if (!row) {
      const k = webpush.generateVAPIDKeys();
      // Two instances starting together: the first insert wins, both then read the same row.
      await this.prisma.$executeRaw`INSERT INTO push_keys (id, "publicKey", "privateKeyEnc", "createdAt") VALUES ('default', ${k.publicKey}, ${encryptField(k.privateKey)}, now()) ON CONFLICT (id) DO NOTHING`;
      row = await this.prisma.pushKeys.findUniqueOrThrow({ where: { id: 'default' } });
    }
    this.keyCache = { publicKey: row.publicKey, privateKey: decryptField(row.privateKeyEnc) };
    return this.keyCache;
  }

  private subject() {
    const site = siteUrl();
    return process.env.PUSH_SUBJECT || (site.startsWith('https://') ? site : 'mailto:parvsetu@gmail.com');
  }

  async publicKey() {
    return { publicKey: (await this.keys()).publicKey };
  }

  private async upsert(dto: PushSubscriptionDto, userAgent: string | undefined, userId?: string) {
    const lang = LANGS.includes(dto.lang as (typeof LANGS)[number]) ? dto.lang! : 'en';
    const data = { p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null, lang };
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...data, userId: userId ?? null },
      // A signed-in save claims the phone for that user; a visitor's save never removes the user link.
      update: { ...data, ...(userId ? { userId } : {}) },
    });
  }

  /** This phone gets the signed-in user's notifications (organiser, blogger, vendor…). */
  async subscribeUser(userId: string, dto: PushSubscriptionDto, userAgent?: string) {
    await this.upsert(dto, userAgent, userId);
    return { subscribed: true };
  }

  /** Visitor: remind this phone about one pass order (proved with its access key, like the pass page). */
  async subscribeOrder(orderId: string, key: string, dto: PushSubscriptionDto, userAgent?: string) {
    const o = await this.prisma.passOrder.findUnique({ where: { id: orderId }, select: { id: true, accessKey: true, status: true } }).catch(() => null);
    const a = Buffer.from(o?.accessKey ?? 'x'.repeat(32));
    const b = Buffer.from(key ?? '');
    if (!o || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Booking not found');
    const sub = await this.upsert(dto, userAgent);
    await this.prisma.pushPassLink.upsert({ where: { subscriptionId_passOrderId: { subscriptionId: sub.id, passOrderId: o.id } }, create: { subscriptionId: sub.id, passOrderId: o.id }, update: {} });
    return { subscribed: true };
  }

  /** Turn notifications off on this phone (the endpoint itself is the proof — it's a secret URL). */
  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { subscribed: false };
  }

  async status(endpoint: string, userId?: string) {
    const s = await this.prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } });
    return { subscribed: !!s && (!userId || s.userId === userId) };
  }

  // ─── Sending ───────────────────────────────────────────────────────

  async sendToUser(userId: string, msg: PushMessage) {
    await this.deliver(await this.prisma.pushSubscription.findMany({ where: { userId } }), msg);
  }

  /** Every user of an account type (e.g. all logins of one vendor or blogger). */
  async sendToUsers(userIds: string[], msg: PushMessage) {
    if (!userIds.length) return;
    await this.deliver(await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } }), msg);
  }

  /** The phones that asked for reminders about one pass order (visitors have no login). */
  async sendToOrder(passOrderId: string, msg: PushMessage) {
    const links = await this.prisma.pushPassLink.findMany({ where: { passOrderId }, select: { subscription: true } });
    await this.deliver(links.map((l) => l.subscription), msg);
  }

  /** Never throws. Gone subscriptions (404 / 410) are deleted. */
  private async deliver(subs: PushSubscription[], msg: PushMessage | ((s: PushSubscription) => PushMessage)) {
    if (!subs.length) return;
    let k: { publicKey: string; privateKey: string };
    try {
      k = await this.keys();
    } catch (e) {
      this.log.warn(`Push keys unavailable: ${e instanceof Error ? e.message : e}`);
      return;
    }
    const vapidDetails = { subject: this.subject(), publicKey: k.publicKey, privateKey: k.privateKey };
    for (const s of subs) {
      const m = typeof msg === 'function' ? msg(s) : msg;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { vapidDetails, TTL: 6 * 3600, urgency: 'normal' });
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date() } }).catch(() => undefined);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else this.log.warn(`Push to ${s.id} failed (${code ?? 'network'}): ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      }
    }
  }

  /**
   * Pass reminders: paid orders whose window starts within the next few hours
   * (and hasn't ended), with a subscribed phone, get one reminder. The order is
   * claimed with a conditional update first, so two API instances never send
   * the same reminder twice.
   */
  async sendDueReminders(now = new Date()) {
    const until = new Date(now.getTime() + REMINDER_LEAD_HOURS * 3600_000);
    const due = await this.prisma.passOrder.findMany({
      where: { status: 'PAID', reminderSentAt: null, validFrom: { lte: until }, validUntil: { gt: now }, pushLinks: { some: {} } },
      select: { id: true, accessKey: true, validFrom: true, validUntil: true, event: { select: { name: true, timezone: true } }, pushLinks: { select: { subscription: true } } },
      take: 200,
    });
    let sent = 0;
    for (const o of due) {
      const claimed = await this.prisma.passOrder.updateMany({ where: { id: o.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (claimed.count !== 1) continue;
      const time = (d: Date) => DateTime.fromJSDate(d, { zone: o.event.timezone }).toFormat('HH:mm');
      const url = `/pass/${o.id}?k=${encodeURIComponent(o.accessKey)}`;
      await this.deliver(o.pushLinks.map((l) => l.subscription), (s) => {
        const t = (REMINDER[s.lang as (typeof LANGS)[number]] ?? REMINDER.en)(o.event.name, time(o.validFrom), time(o.validUntil));
        return { ...t, url, tag: `pass-${o.id}` };
      });
      sent++;
    }
    return sent;
  }

  private timer?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      this.timer = setInterval(() => void this.sendDueReminders().catch((e) => this.log.warn(`Reminders failed: ${e instanceof Error ? e.message : e}`)), 10 * 60_000);
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
