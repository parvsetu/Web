'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { cx } from '@/lib/cx';
import { Alert, Button, Card, SectionTitle } from '../ui';

interface SlugCheck {
  slug: string;
  current: string | null;
  year: number;
  valid: boolean;
  available: boolean;
  reason: string | null;
  suggestion: string | null;
}

/**
 * The festival's public address (/f/<slug>). Checked live as the organiser types:
 * format, the festival year (the same festival repeats every year), and whether
 * another festival already has it. Old addresses keep working after a change.
 */
export function PageAddressCard() {
  const ev = useEvent();
  const [value, setValue] = useState(ev.slug ?? '');
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => setValue(ev.slug ?? ''), [ev.slug]);

  // Debounced live check.
  useEffect(() => {
    if (!value.trim() || value === ev.slug) {
      setCheck(null);
      return;
    }
    let alive = true;
    setChecking(true);
    const t = setTimeout(() => {
      api.get<SlugCheck>(`/events/${ev.eventId}/slug/check`, { slug: value })
        .then((r) => alive && setCheck(r))
        .catch((e) => alive && setError(errorMessage(e)))
        .finally(() => alive && setChecking(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [value, ev.eventId, ev.slug]);

  async function save(slug: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/events/${ev.eventId}/slug`, { slug });
      ev.reloadDetail();
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}/f/${ev.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const changed = !!value.trim() && value !== ev.slug;
  const ok = changed && check?.available && check.slug === value;
  const year = (ev.startDate || '').slice(0, 4);

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={Link2}>Festival page address</SectionTitle>
      <p className="text-sm text-slate-600">
        The link people share and Google shows. Use small letters, digits and hyphens, and include the year
        {year ? <> (<strong>{year}</strong>)</> : null} — next year&apos;s festival gets its own page. Links to the old address keep working.
      </p>
      {ev.slug && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Now:</span>
          <a href={`/f/${ev.slug}`} target="_blank" rel="noreferrer" className="break-all font-semibold text-brand-700 underline-offset-2 hover:underline">
            {origin.replace(/^https?:\/\//, '')}/f/{ev.slug}
          </a>
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex min-w-[240px] flex-1 items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-500">
          <span className="shrink-0 pl-3 text-sm text-slate-500">/f/</span>
          <input
            aria-label="Page address"
            value={value}
            maxLength={80}
            onChange={(e) => { setValue(e.target.value.toLowerCase().replace(/\s+/g, '-')); setSaved(false); setError(null); }}
            className="min-h-[44px] w-full min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none"
            placeholder={`your-mandal-durga-puja-${year || '2026'}`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button onClick={() => save(value)} disabled={!ok || saving} loading={saving}>Save address</Button>
      </div>
      {changed && (
        <p className={cx('flex items-start gap-1.5 text-sm', checking ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-red-700')} aria-live="polite">
          {checking ? 'Checking…' : ok ? <><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> Available</> : check ? <><X aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> {check.slug !== value ? <>Will be saved as <code className="font-semibold">{check.slug || '—'}</code>. </> : null}{check.reason}</> : null}
        </p>
      )}
      {changed && !checking && check?.suggestion && !ok && (
        <p className="text-sm text-slate-700">
          Try{' '}
          <button type="button" className="font-semibold text-brand-700 underline underline-offset-2" onClick={() => setValue(check.suggestion!)}>
            {check.suggestion}
          </button>
        </p>
      )}
      {saved && <Alert kind="success">Saved. The page now lives at /f/{ev.slug}; the old address still opens it.</Alert>}
      {error && <Alert>{error}</Alert>}
    </Card>
  );
}
