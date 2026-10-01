'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, HelpCircle, Mail, Search } from 'lucide-react';
import { FAQ, FAQ_CONTACT_EMAIL } from '@/lib/faq';
import { cx } from '@/lib/cx';

export function FaqBrowser() {
  const [q, setQ] = useState('');
  const [section, setSection] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);

  // Deep link: /faq#group opens and scrolls to that question.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }));
  }, []);

  const t = q.trim().toLowerCase();
  const sections = useMemo(
    () =>
      FAQ.filter((s) => section === 'all' || s.id === section)
        .map((s) => ({ ...s, items: t ? s.items.filter((i) => `${i.q} ${i.a.join(' ')}`.toLowerCase().includes(t)) : s.items }))
        .filter((s) => s.items.length > 0),
    [section, t],
  );
  const count = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-lg sm:p-8">
        <span aria-hidden className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
            <HelpCircle aria-hidden className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">Help &amp; FAQ</h1>
            <p className="text-sm text-white/90 sm:text-base">Everything a mandal asks before and during the festival.</p>
          </div>
        </div>
        <label className="relative mt-5 block">
          <span className="sr-only">Search questions</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search — e.g. group pass, GST, volunteer, refund"
            className="min-h-[52px] w-full rounded-2xl border-0 bg-white pl-12 pr-4 text-base text-slate-900 shadow-md outline-none ring-orange-300 focus:ring-4"
          />
        </label>
      </section>

      <nav aria-label="FAQ topics" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {[{ id: 'all', title: 'All topics', emoji: '✨' }, ...FAQ].map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
            className={cx(
              'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold',
              section === s.id ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : 'border-orange-200 bg-white text-slate-700 hover:bg-orange-50',
            )}
          >
            <span aria-hidden>{s.emoji}</span> {s.title}
          </button>
        ))}
      </nav>

      {t && (
        <p className="text-sm text-slate-500" aria-live="polite">
          {count} answer{count === 1 ? '' : 's'} for “{q.trim()}”
        </p>
      )}

      {sections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-orange-200 bg-white p-8 text-center text-slate-600">
          No answer matches that yet. Try another word, or ask us below.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`faq-${s.id}`} className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
              <h2 id={`faq-${s.id}`} className="flex items-center gap-2 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3 text-lg font-bold text-slate-900">
                <span aria-hidden className="text-xl">{s.emoji}</span> {s.title}
              </h2>
              <ul className="divide-y divide-orange-50">
                {s.items.map((i) => {
                  const isOpen = open === i.id || !!t;
                  return (
                    <li key={i.id} id={i.id} className="scroll-mt-20">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(open === i.id ? null : i.id)}
                        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left font-semibold text-slate-900 hover:bg-orange-50/60"
                      >
                        <span className="flex-1">{i.q}</span>
                        <ChevronDown aria-hidden className={cx('h-5 w-5 shrink-0 text-orange-500 transition-transform', isOpen && 'rotate-180')} />
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-2 px-4 pb-4 text-[15px] leading-relaxed text-slate-700">
                          {i.a.map((p, n) => (
                            <p key={n}>{p}</p>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="flex flex-col items-start gap-3 rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
          <Mail aria-hidden className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h2 className="font-bold text-slate-900">Still have a question?</h2>
          <p className="text-sm text-slate-600">Write to us and we’ll help your mandal get set up.</p>
        </div>
        <a
          href={`mailto:${FAQ_CONTACT_EMAIL}?subject=${encodeURIComponent('Parvsetu question')}`}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 font-semibold text-white shadow-md"
        >
          <Mail aria-hidden className="h-5 w-5" /> {FAQ_CONTACT_EMAIL}
        </a>
      </section>
    </div>
  );
}
