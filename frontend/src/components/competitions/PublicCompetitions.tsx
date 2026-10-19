'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, Clock, MapPin, Medal, Sun, Trophy, Warehouse } from 'lucide-react';
import { cx } from '@/lib/cx';
import { dayPartsL, fmtHHmmL, fmtLongDateTimeL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { KIND_EMOJI, entryHref, savedEntries, type PublicCategory, type PublicCompetition, type SavedEntry } from '@/lib/competition-types';

/** Festival page: every published competition with categories, fees, spots, an Enter button and (once published) results. */
export function PublicCompetitions({ competitions, accent }: { competitions: PublicCompetition[]; accent: string }) {
  const { t } = useT();
  const [mine, setMine] = useState<SavedEntry[]>([]);
  useEffect(() => {
    const ids = new Set(competitions.map((c) => c.name));
    setMine(savedEntries().filter((e) => ids.has(e.competition)));
  }, [competitions]);
  if (!competitions.length) return null;
  return (
    <section id="competitions" className="flex flex-col gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Trophy aria-hidden className="h-5 w-5" style={{ color: accent }} /> {t('comp.title')}
      </h2>
      {mine.length > 0 && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
          <p className="font-semibold text-emerald-900">{t('comp.viewEntries')}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {mine.map((e) => (
              <li key={e.id}>
                <Link href={entryHref(e.id, e.k)} className="font-semibold text-emerald-800 underline underline-offset-2">{e.name} · {e.competition}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {competitions.map((c) => <CompetitionCard key={c.id} c={c} accent={accent} />)}
    </section>
  );
}

function CompetitionCard({ c, accent }: { c: PublicCompetition; accent: string }) {
  const { t, tp, locale } = useT();
  const [showResults, setShowResults] = useState(c.resultsPublished);
  const p = dayPartsL(c.date, locale);
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="flex gap-3 p-3">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: accent }}>
          <span className="text-[11px] font-bold uppercase">{p.month}</span>
          <span className="text-xl font-extrabold leading-none">{p.day}</span>
          <span className="text-[11px]">{p.weekday}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900">{KIND_EMOJI[c.kind]} {t(`comp.kind.${c.kind}` as 'comp.kind.OTHER')}</span>
            {c.setting && (
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5', c.setting === 'OUTDOOR' ? 'bg-lime-100 text-lime-900' : 'bg-violet-100 text-violet-900')}>
                {c.setting === 'OUTDOOR' ? <Sun aria-hidden className="h-3.5 w-3.5" /> : <Warehouse aria-hidden className="h-3.5 w-3.5" />}
                {c.setting === 'OUTDOOR' ? t('prog.outdoor') : t('prog.indoor')}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-extrabold leading-snug">{c.name}</h3>
          <p className="flex flex-wrap gap-x-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-4 w-4" /> {fmtHHmmL(c.startTime, locale)}</span>
            {c.venue && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-4 w-4" /> {c.venue}</span>}
          </p>
          {c.registrationClosesAt && !c.closedReason && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays aria-hidden className="h-3.5 w-3.5" /> {t('comp.closesOn', { date: fmtLongDateTimeL(c.registrationClosesAt, 'Asia/Kolkata', locale) })}
            </p>
          )}
        </div>
      </div>
      {c.description && <p className="whitespace-pre-line px-3 pb-2 text-sm text-slate-700">{c.description}</p>}

      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {c.categories.map((cat) => (
          <li key={cat.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{cat.name}</p>
              <p className="text-xs text-slate-500">{eligibilityText(cat, t, tp)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                <p className="font-bold">{Number(cat.fee) > 0 ? `₹${Number(cat.fee)}` : t('common.free')}{Number(cat.fee) > 0 && c.gstOnFees ? <span className="text-xs font-normal text-slate-500"> {t('comp.plusGst')}</span> : null}</p>
                {cat.spotsLeft !== null && !cat.full && <p className="text-xs text-slate-500">{tp('comp.spotsLeft', cat.spotsLeft)}</p>}
              </div>
              {c.closedReason ? null : cat.full ? (
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500">{t('comp.full')}</span>
              ) : (
                <Link href={`/compete/${c.id}?category=${cat.id}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 font-bold text-white" style={{ background: accent }}>
                  {t('comp.enter')} <ChevronRight aria-hidden className="h-4 w-4" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {c.closedReason && !c.resultsPublished && <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">{c.closedReason}</p>}

      {c.resultsPublished && (
        <div className="border-t border-slate-100 bg-amber-50/50 px-3 py-2">
          <button type="button" onClick={() => setShowResults((v) => !v)} className="flex min-h-[40px] w-full items-center justify-between font-bold text-amber-900" aria-expanded={showResults}>
            <span className="inline-flex items-center gap-1.5"><Medal aria-hidden className="h-5 w-5" /> {t('comp.results')}</span>
            <ChevronRight aria-hidden className={cx('h-5 w-5 transition', showResults && 'rotate-90')} />
          </button>
          {showResults && c.categories.map((cat) => (
            <div key={cat.id} className="py-2">
              <p className="text-sm font-semibold text-slate-700">{cat.name}</p>
              {cat.results && cat.results.length ? (
                <ol className="mt-1 flex flex-col gap-0.5 text-sm">
                  {cat.results.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className={cx('w-8 shrink-0 text-center font-extrabold', r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : r.rank === 3 ? 'text-orange-700' : 'text-slate-500')}>
                        {r.rank ? (r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`) : '–'}
                      </span>
                      <span className="flex-1">{r.name}{r.city ? <span className="text-slate-500"> · {r.city}</span> : null}</span>
                      {r.result && <span className="font-mono text-slate-700">{r.result}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-slate-500">{t('comp.noResults')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function eligibilityText(cat: PublicCategory, t: ReturnType<typeof useT>['t'], tp: ReturnType<typeof useT>['tp']) {
  const parts: string[] = [];
  if (cat.gender === 'MALE') parts.push(t('comp.genderMALE'));
  if (cat.gender === 'FEMALE') parts.push(t('comp.genderFEMALE'));
  if (cat.minAge !== null && cat.maxAge !== null) parts.push(t('comp.agesRange', { min: cat.minAge, max: cat.maxAge }));
  else if (cat.minAge !== null) parts.push(t('comp.agesMin', { min: cat.minAge }));
  else if (cat.maxAge !== null) parts.push(t('comp.agesMax', { max: cat.maxAge }));
  if (cat.entrants > 0) parts.push(tp('comp.entrants', cat.entrants));
  return parts.join(' · ');
}
