'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutTemplate, Lock, RotateCcw, Save } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { cx } from '@/lib/cx';
import type { LayoutSection, LayoutSectionId, LayoutState } from '@/lib/review-types';
import { Alert, Button, Card, SectionTitle, Select, SkeletonList } from '../ui';

const SECTION_LABEL: Record<LayoutSectionId, { title: string; hint: string }> = {
  hero: { title: 'Banner & name', hint: 'Always first' },
  about: { title: 'About & highlights', hint: '' },
  upcoming: { title: 'Upcoming festivals', hint: 'With booking buttons' },
  trophies: { title: 'Trophies & recognition', hint: 'Hidden while there are none' },
  reviews: { title: 'Visitor reviews', hint: 'Approved reviews, featured first' },
  visitorPhotos: { title: 'Visitor photos & selfies', hint: 'Photos you approved on reviews' },
  gallery: { title: 'Festival photos', hint: 'Your public photos' },
  past: { title: 'Past festivals', hint: 'By year' },
  sponsors: { title: 'Sponsors', hint: '' },
  contact: { title: 'Contact', hint: 'Phone, email and social links' },
};

const VARIANT_LABEL: Record<string, string> = {
  CHIPS: 'Highlight tiles',
  LIST: 'List',
  CARDS: 'Cards',
  SHELF: 'Swipeable shelf',
  GRID: 'Grid',
  SLIDER: 'Swipeable row',
  CAROUSEL: 'Swipeable row',
  DEFAULT: 'Standard',
};

/** Order, show/hide and style of each section on the public landing page. */
export function LayoutEditor({ editable }: { editable: boolean }) {
  const org = useOrg();
  const path = `/organizations/${org.orgId}/landing-page/layout`;
  const q = useAsync(() => api.get<LayoutState>(path), [path]);
  const [list, setList] = useState<LayoutSection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (q.data) setList(q.data.sections);
  }, [q.data]);

  const dirty = !!q.data && JSON.stringify(list) !== JSON.stringify(q.data.sections);
  const update = (next: LayoutSection[]) => {
    setOk(false);
    setList(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    update(next);
  };
  const patch = (i: number, p: Partial<LayoutSection>) => update(list.map((s, j) => (j === i ? { ...s, ...p } : s)));

  async function save(sections: LayoutSection[]) {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api.put(path, { sections });
      setOk(true);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={LayoutTemplate}>Page layout</SectionTitle>
      <p className="-mt-2 text-sm text-slate-600">Choose the order of the sections on your page, hide the ones you don’t want, and pick a style where there is a choice. Empty sections are skipped automatically.</p>
      {q.error && <Alert>{q.error}</Alert>}
      {!q.data ? (
        <SkeletonList rows={3} />
      ) : (
        <ol className="flex flex-col gap-2">
          {list.map((s, i) => {
            const hero = s.id === 'hero';
            const label = SECTION_LABEL[s.id];
            const variants = q.data!.catalog[s.id] ?? [];
            return (
              <li key={s.id} className={cx('flex flex-wrap items-center gap-2 rounded-xl border border-orange-100 p-2', !s.visible && 'bg-slate-50')}>
                <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  {hero ? (
                    <Lock aria-hidden className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-orange-600" checked={s.visible} disabled={!editable} onChange={(e) => patch(i, { visible: e.target.checked })} />
                  )}
                  <span className="min-w-0">
                    <span className={cx('block font-semibold', !s.visible && 'text-slate-500 line-through')}>{label?.title ?? s.id}</span>
                    {label?.hint && <span className="block text-xs text-slate-500">{label.hint}</span>}
                  </span>
                </label>
                {variants.length > 1 && (
                  <Select aria-label={`${label?.title ?? s.id} style`} value={s.variant} disabled={!editable || !s.visible} onChange={(e) => patch(i, { variant: e.target.value })} className="!min-h-[40px] w-auto text-sm">
                    {variants.map((v) => <option key={v} value={v}>{VARIANT_LABEL[v] ?? v}</option>)}
                  </Select>
                )}
                {editable && !hero && (
                  <span className="flex">
                    <Button variant="ghost" size="sm" aria-label="Move up" disabled={i <= 1} onClick={() => move(i, -1)}><ArrowUp aria-hidden className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden className="h-4 w-4" /></Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">Layout saved. The public page refreshes within a few minutes.</Alert>}
      {editable && q.data && (
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={!dirty} onClick={() => void save(list)}><Save aria-hidden className="h-4 w-4" /> Save layout</Button>
          {dirty && <Button variant="ghost" disabled={busy} onClick={() => update(q.data!.sections)}>Undo changes</Button>}
          {q.data.customized && !dirty && (
            <Button variant="secondary" disabled={busy} onClick={() => confirm('Go back to the standard layout?') && void save(q.data!.defaults)}>
              <RotateCcw aria-hidden className="h-4 w-4" /> Standard layout
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
