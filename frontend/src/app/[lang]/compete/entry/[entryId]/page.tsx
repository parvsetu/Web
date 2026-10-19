'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Award, CheckCircle2, Clock3, CreditCard, Medal, RotateCcw, XCircle } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { QrImage } from '@/components/QrImage';
import { Alert, Button, Skeleton } from '@/components/ui';
import { BookingError, publicApi } from '@/lib/booking';
import { fmtDateL, fmtHHmmL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { KIND_EMOJI, saveEntry, type EntryView } from '@/lib/competition-types';

export default function EntryPage() {
  return (
    <PublicShell>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Entry />
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
  return until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : null;
}

function Entry() {
  const { entryId } = useParams<{ entryId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const { t, locale } = useT();
  const [e, setE] = useState<EntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<'success' | 'fail' | null>(null);
  const left = useCountdown(e?.status === 'PENDING' ? e.expiresAt : null);

  const load = useCallback(async () => {
    try {
      const r = await publicApi.get<EntryView>(`/public/competitions/entries/${entryId}`, { k });
      setE(r);
      saveEntry({ id: r.id, k, name: r.participantName, competition: r.competition.name, at: r.createdAt ?? new Date().toISOString() });
    } catch (err) {
      if (err instanceof BookingError && err.status === 404) setNotFound(true);
      else setError(err instanceof BookingError ? err.message : String(err));
    }
  }, [entryId, k]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay(outcome: 'success' | 'fail') {
    setBusy(outcome);
    setError(null);
    try {
      setE(await publicApi.post<EntryView>(`/public/competitions/entries/${entryId}/demo-pay`, { k, outcome }));
    } catch (err) {
      setError(err instanceof BookingError ? err.message : String(err));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (notFound) return <Alert>{t('comp.entry.notFound')}</Alert>;
  if (!e) return error ? <Alert>{error}</Alert> : <Skeleton className="h-96" />;

  const c = e.competition;
  const backHref = `/f/${e.event.slug ?? e.event.id}#competitions`;
  const mmss = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 p-4 text-white shadow-lg">
        <p className="text-sm opacity-90">{e.event.name} · {e.event.organization}</p>
        <h1 className="mt-1 text-xl font-extrabold"><span aria-hidden>{KIND_EMOJI[c.kind]}</span> {c.name}</h1>
        <p className="text-sm opacity-90">{e.category.name}</p>
        <p className="mt-1 text-sm opacity-90">{fmtDateL(c.date, locale)} · {fmtHHmmL(c.startTime, locale)}{c.venue ? ` · ${c.venue}` : ''}</p>
      </div>

      {error && <Alert>{error}</Alert>}

      {e.status === 'PENDING' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-bold text-amber-900"><Clock3 aria-hidden className="h-5 w-5" /> {t('comp.entry.pending')}</p>
          <p className="text-sm text-amber-900">{e.participantName} · {t('comp.entry.amount')}: ₹{e.amount}{Number(e.gst) > 0 ? ` (GST ₹${e.gst})` : ''}</p>
          {left !== null && left > 0 && <p className="text-sm text-amber-800">{t('comp.entry.holdLeft', { time: mmss })}</p>}
          {e.paymentProvider === 'demo' && (
            <>
              <Button size="lg" loading={busy === 'success'} disabled={!!busy} onClick={() => pay('success')}>
                <CreditCard aria-hidden className="h-5 w-5" /> {t('comp.entry.payNow', { amount: e.amount })}
              </Button>
              <button type="button" disabled={!!busy} onClick={() => pay('fail')} className="text-sm text-slate-600 underline underline-offset-2">{t('comp.entry.failSim')}</button>
            </>
          )}
        </div>
      )}

      {e.status === 'PAID' && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-white p-4 text-center shadow-sm">
          <p className="flex items-center gap-2 text-lg font-extrabold text-emerald-700"><CheckCircle2 aria-hidden className="h-6 w-6" /> {t('comp.entry.paid')}</p>
          <p className="text-xl font-bold">{e.participantName}</p>
          {e.bibNo !== null && (
            <div className="rounded-2xl bg-slate-900 px-6 py-3 text-white">
              <p className="text-xs uppercase tracking-wide opacity-80">{t('comp.entry.bib')}</p>
              <p className="font-mono text-5xl font-extrabold">{e.bibNo}</p>
            </div>
          )}
          {e.heat !== null && e.lane !== null && <p className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-900">{t('comp.entry.heatLane', { heat: e.heat, lane: e.lane })}</p>}
          {e.checkedInAt ? (
            <p className="flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 aria-hidden className="h-4 w-4" /> {t('comp.entry.checkedIn')}</p>
          ) : e.qrPayload ? (
            <>
              <QrImage payload={e.qrPayload} size={220} alt={t('comp.entry.showQr')} />
              <p className="text-sm text-slate-600">{t('comp.entry.showQr')}</p>
            </>
          ) : null}
          {e.result && (
            <div className="w-full rounded-xl bg-amber-50 p-3">
              <p className="flex items-center justify-center gap-1.5 font-bold text-amber-900"><Medal aria-hidden className="h-5 w-5" /> {t('comp.entry.result')}: {e.result}</p>
              {e.rank !== null && <p className="text-sm text-amber-900">{t('comp.entry.rank', { rank: e.rank })}</p>}
            </div>
          )}
          {e.certificateAvailable && (
            <Link href={`/compete/certificate/${e.id}?k=${encodeURIComponent(k)}`} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-bold text-white">
              <Award aria-hidden className="h-5 w-5" /> {t('comp.entry.certificate')}
            </Link>
          )}
          <p className="text-xs text-slate-500">
            {t('comp.entry.amount')}: ₹{e.amount}{e.invoiceNo ? ` · ${t('comp.entry.invoice', { no: e.invoiceNo })}` : ''}
          </p>
          <p className="text-xs text-slate-500">{t('comp.entry.saveLink')}</p>
        </div>
      )}

      {(e.status === 'FAILED' || e.status === 'EXPIRED') && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-bold text-red-800"><XCircle aria-hidden className="h-5 w-5" /> {e.status === 'FAILED' ? t('comp.entry.failed') : t('comp.entry.expired')}</p>
          <Link href={`/compete/${c.id}?category=${e.category.id}`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white font-bold text-red-800 ring-1 ring-red-200">
            <RotateCcw aria-hidden className="h-4 w-4" /> {t('comp.entry.tryAgain')}
          </Link>
        </div>
      )}

      {e.status === 'CANCELLED' && (
        <Alert kind="warning">
          {t('comp.entry.cancelled')} {e.cancelReason}
          {Number(e.refund) > 0 ? ` ${t('comp.entry.refund', { amount: e.refund })}` : ''}
        </Alert>
      )}

      <Link href={backHref} className="text-center text-sm font-semibold text-slate-600 underline underline-offset-2">{t('comp.form.back')}</Link>
    </div>
  );
}
