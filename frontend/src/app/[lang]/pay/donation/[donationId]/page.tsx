'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, CircleX, CreditCard, HandHeart, LinkIcon, Lock, RotateCcw, Smartphone, Timer, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Alert, Button, Empty, Skeleton, cx } from '@/components/ui';
import { festivalTheme } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { BookingError } from '@/lib/booking';
import { donate, donateHref, type PublicDonation } from '@/lib/donate';
import type { MessageKey } from '@/lib/i18n/core';
import { useT } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';

type Method = 'upi' | 'card' | 'netbanking';
const METHODS: { key: Method; icon: LucideIcon }[] = [
  { key: 'upi', icon: Smartphone },
  { key: 'card', icon: CreditCard },
  { key: 'netbanking', icon: Building2 },
];

/**
 * Checkout for a public donation. Only the demo gateway exists today: it
 * confirms through POST /public/donations/:id/demo-pay. Once paid, the donor
 * is sent straight to their receipt (/r/<id>?k=…).
 */
export default function DonationPayPage() {
  return (
    <PublicShell>
      <Suspense fallback={<PaySkeleton />}>
        <Checkout />
      </Suspense>
    </PublicShell>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
}

function Checkout() {
  const { donationId } = useParams<{ donationId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const router = useRouter();
  const [d, setD] = useState<PublicDonation | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'success' | 'fail' | null>(null);
  const [method, setMethod] = useState<Method>('upi');
  const redirected = useRef(false);
  const { t } = useT();
  const errText = useBookingErrorText();

  const load = useCallback(async () => {
    try {
      setD(await donate.get(donationId, k));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof BookingError ? e : new BookingError(0, errText(e)));
    }
  }, [donationId, k, errText]);

  useEffect(() => {
    if (k) void load();
  }, [k, load]);

  // Paid (also after the back button) → the receipt.
  useEffect(() => {
    if (d?.status === 'SUCCESS' && d.receiptPath && !redirected.current) {
      redirected.current = true;
      router.replace(d.receiptPath);
    }
  }, [d, router]);

  const left = useCountdown(d?.status === 'PENDING' ? d.expiresAt : null);
  // When the window runs out, ask the server (it decides, not us).
  useEffect(() => {
    if (left === 0) void load();
  }, [left, load]);

  async function pay(outcome: 'success' | 'fail') {
    if (busy) return;
    setBusy(outcome);
    setActionError(null);
    try {
      const r = await donate.demoPay(donationId, k, outcome);
      setD(r);
      if (r.status === 'SUCCESS' && r.receiptPath) {
        redirected.current = true;
        router.replace(r.receiptPath);
        return;
      }
    } catch (e) {
      const err = e instanceof BookingError ? e : null;
      if (err?.status === 409) await load();
      else setActionError(errText(e));
    }
    setBusy(null);
  }

  if (!k) {
    return (
      <Empty title={t('pay.incomplete')} icon={LinkIcon}>
        {t('donate.pay.incompleteHint')}
      </Empty>
    );
  }
  if (loadError && !d) {
    return loadError.status === 404 ? (
      <Empty title={t('donate.pay.notFound')} icon={XCircle}>
        {t('donate.pay.notFoundHint')}
        <div className="mt-4">
          <Link href="/" className="font-semibold text-orange-700 hover:underline">
            {t('common.browseFestivals')}
          </Link>
        </div>
      </Empty>
    ) : (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{errText(loadError)}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RotateCcw aria-hidden className="h-4 w-4" /> {t('common.retry')}
          </Button>
        </div>
      </Alert>
    );
  }
  if (!d || d.status === 'SUCCESS') return <PaySkeleton />;

  const th = festivalTheme(d.event.festivalType);

  if (d.status !== 'PENDING') {
    return (
      <div className="flex flex-col gap-4">
        {d.payment.demo && <DemoBanner />}
        <div className="flex flex-col gap-4 rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <CircleX aria-hidden className="h-8 w-8" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{t('donate.pay.failed')}</h1>
            <p className="mt-1 text-slate-600">{t('donate.pay.failedHint')}</p>
          </div>
          <Link
            href={donateHref(d.event.id)}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
          >
            <HandHeart aria-hidden className="h-5 w-5" /> {t('donate.pay.again')}
          </Link>
        </div>
      </div>
    );
  }

  if (!d.payment.demo) {
    // A real gateway would take over here; nothing to simulate.
    return <Alert kind="info">{t('donate.pay.waiting')}</Alert>;
  }

  const mins = left !== null ? Math.floor(left / 60) : 0;
  const secs = left !== null ? left % 60 : 0;
  const urgent = left !== null && left < 120;

  return (
    <div className="flex flex-col gap-4">
      <DemoBanner />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">{t('donate.pay.title')}</h1>
        <div
          role="timer"
          aria-label={t('donate.pay.timerAria', { m: mins, s: secs })}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-base font-bold tabular-nums',
            urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
          )}
        >
          <Timer aria-hidden className="h-4 w-4" />
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </div>

      <section aria-label={t('pay.summary')} className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 p-4" style={{ background: th.soft }}>
          <FestivalBadge type={d.event.festivalType} className="h-14 w-14 bg-white" />
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{d.event.name}</p>
            <p className="truncate text-sm" style={{ color: th.ink }}>
              {d.event.organization.name}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500">{t('donate.pay.from')}</dt>
            <dd className="text-right font-medium text-slate-900">{d.donorName ?? t('donate.pay.anonymous')}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
            <dt className="text-base font-bold text-slate-900">{t('donate.pay.amount')}</dt>
            <dd className="text-2xl font-extrabold" style={{ color: th.ink }}>
              {fmtMoney(d.amount, d.currency)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label={t('pay.methodSection')}>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{t('pay.payWith')}</h2>
        <div role="radiogroup" aria-label={t('pay.method')} className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => {
            const sel = method === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setMethod(m.key)}
                className={cx(
                  'flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center transition',
                  sel ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-orange-200',
                )}
              >
                <m.icon aria-hidden className={cx('h-6 w-6', sel ? 'text-orange-600' : 'text-slate-500')} />
                <span className="text-sm font-bold leading-tight text-slate-900">{t(`pay.${m.key}` as MessageKey)}</span>
                <span className="text-[11px] leading-tight text-slate-500">{t(`pay.${m.key}Sub` as MessageKey)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('pay.demoOnly')}</p>
      </section>

      {actionError && <Alert>{actionError}</Alert>}

      <div className="flex flex-col gap-2">
        <Button variant="success" size="lg" onClick={() => void pay('success')} loading={busy === 'success'} disabled={!!busy || left === 0} className="w-full">
          {busy !== 'success' && <Lock aria-hidden className="h-5 w-5" />}
          {t('pay.payDemo', { amount: fmtMoney(d.amount, d.currency) })}
        </Button>
        <Button variant="ghost" onClick={() => void pay('fail')} loading={busy === 'fail'} disabled={!!busy || left === 0} className="w-full text-red-700">
          {busy !== 'fail' && <XCircle aria-hidden className="h-5 w-5" />}
          {t('pay.simulateFail')}
        </Button>
      </div>
    </div>
  );
}

function DemoBanner() {
  const { t } = useT();
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border-2 border-amber-400 bg-amber-100 px-4 py-3 text-amber-950 shadow-sm">
      <AlertTriangle aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
      <div>
        <p className="font-extrabold">{t('pay.demoBanner')}</p>
        <p className="text-sm">{t('pay.demoBannerSub')}</p>
      </div>
    </div>
  );
}

function PaySkeleton() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('pay.loading')}>
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}
