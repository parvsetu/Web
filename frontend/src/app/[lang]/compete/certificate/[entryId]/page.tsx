'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { Alert, Button, Skeleton } from '@/components/ui';
import { BookingError, publicApi } from '@/lib/booking';
import { fmtDateL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { KIND_EMOJI, entryHref, type Certificate } from '@/lib/competition-types';

export default function CertificatePage() {
  return (
    <PublicShell wide>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CertificateView />
      </Suspense>
    </PublicShell>
  );
}

/** A printable certificate (A4 landscape). "Print / save as PDF" uses the browser's own print dialog. */
function CertificateView() {
  const { entryId } = useParams<{ entryId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const { t, locale } = useT();
  const [c, setC] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi.get<Certificate>(`/public/competitions/entries/${entryId}/certificate`, { k })
      .then(setC)
      .catch((e) => setError(e instanceof BookingError ? e.message : String(e)));
  }, [entryId, k]);

  if (error) return <Alert>{error}</Alert>;
  if (!c) return <Skeleton className="h-96" />;
  const winner = c.kind === 'WINNER' && c.rank !== null;
  const place = winner ? t(`comp.cert.place${c.rank}` as 'comp.cert.place1') : '';

  return (
    <div className="flex flex-col gap-4">
      <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={entryHref(entryId, k)} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-slate-600">
          <ArrowLeft aria-hidden className="h-4 w-4" /> {t('comp.entry.title')}
        </Link>
        <Button onClick={() => window.print()}><Printer aria-hidden className="h-4 w-4" /> {t('comp.cert.print')}</Button>
      </div>
      <div className="mx-auto aspect-[297/210] w-full max-w-4xl overflow-hidden bg-white shadow-xl print:max-w-none print:shadow-none">
        <div className="m-[2.5%] flex h-[95%] flex-col items-center justify-center gap-[2.5%] border-[6px] border-double border-amber-600 px-[6%] text-center"
          style={{ background: 'radial-gradient(circle at 50% 0%, #fff7ed 0%, #ffffff 60%)' }}>
          <p className="text-[clamp(10px,1.6vw,16px)] font-semibold uppercase tracking-[0.3em] text-amber-700">{c.organization}</p>
          <p className="text-[clamp(28px,5vw,56px)] leading-none">{winner ? ['🥇', '🥈', '🥉'][c.rank! - 1] : KIND_EMOJI[c.competitionKind]}</p>
          <h1 className="font-serif text-[clamp(20px,3.6vw,40px)] font-bold text-slate-900">
            {winner ? t('comp.cert.titleWinner') : t('comp.cert.titleParticipation')}
          </h1>
          <p className="font-serif text-[clamp(22px,4.2vw,48px)] font-bold italic text-amber-800">{c.participantName}</p>
          <p className="text-[clamp(12px,1.8vw,20px)] text-slate-700">
            {winner ? t('comp.cert.awarded', { place }) : t('comp.cert.tookPart')}
          </p>
          <p className="text-[clamp(14px,2.2vw,26px)] font-bold text-slate-900">{c.competition} — {c.category}</p>
          <p className="text-[clamp(11px,1.6vw,18px)] text-slate-700">
            {c.event.name} · {fmtDateL(c.date, locale)}{c.venue ? ` · ${c.venue}` : ''}
          </p>
          {c.result && <p className="text-[clamp(11px,1.6vw,18px)] font-semibold text-slate-800">{t('comp.cert.result', { result: c.result })}</p>}
          <div className="mt-[2%] flex w-full items-end justify-between text-[clamp(9px,1.2vw,13px)] text-slate-500">
            <span>{t('comp.cert.no', { no: c.certificateNo })}</span>
            <span className="border-t border-slate-400 px-6 pt-1">{t('comp.cert.organiser', { org: c.organization })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
