'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { api, errorMessage, uploadForm } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { useAuthedImage, resizeImage, IMAGE_TYPES } from '@/lib/images';
import { cx } from '@/lib/cx';
import { ACHIEVEMENT_ICONS, type Achievement, type AchievementIcon, type AchievementList } from '@/lib/review-types';
import { ACHIEVEMENT_ICON } from '../landing/Trophies';
import { Alert, Button, Card, Checkbox, Field, LabeledInput, Modal, SectionTitle, SkeletonList, Textarea } from '../ui';

const ICON_LABEL: Record<AchievementIcon, string> = { TROPHY: 'Trophy', MEDAL: 'Medal', STAR: 'Star', RIBBON: 'Ribbon', CERTIFICATE: 'Certificate', CROWN: 'Crown' };

/** Trophies & recognition shown on the landing page (own order, optional photo of the trophy/certificate). */
export function AchievementsEditor({ editable }: { editable: boolean }) {
  const org = useOrg();
  const base = `/organizations/${org.orgId}/achievements`;
  const q = useAsync(() => api.get<AchievementList>(base), [base]);
  const [editing, setEditing] = useState<Achievement | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const items = q.data?.items ?? [];
  const move = (i: number, d: -1 | 1) => {
    const ids = items.map((a) => a.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    void act(() => api.put(`${base}/order`, { ids }));
  };

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle
        icon={Trophy}
        action={editable && q.data && items.length < q.data.max ? <Button size="sm" onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add</Button> : undefined}
      >
        Trophies &amp; recognition
      </SectionTitle>
      <p className="-mt-2 text-sm text-slate-600">
        Awards, prizes and certificates your mandal has received. Visible ones appear on your page{q.data?.customOrder ? ' in the order below' : ', newest year first (use the arrows to set your own order)'}.
        A photo of the trophy or certificate is optional and counts toward your 300 MB photo space.
      </p>
      {q.error && <Alert>{q.error}</Alert>}
      {error && <Alert>{error}</Alert>}
      {!q.data ? (
        <SkeletonList rows={2} />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-orange-200 p-4 text-center text-sm text-slate-500">No trophies added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a, i) => (
            <li key={a.id} className={cx('flex items-center gap-3 rounded-xl border border-orange-100 p-2', !a.isVisible && 'bg-slate-50')}>
              <AchievementThumb orgId={org.orgId} a={a} />
              <div className="min-w-0 flex-1">
                <p className={cx('truncate font-bold', !a.isVisible && 'text-slate-500')}>{a.title}</p>
                <p className="truncate text-xs text-slate-500">{[a.year, a.awardedBy].filter(Boolean).join(' · ') || '—'}{a.isVisible ? '' : ' · hidden'}</p>
              </div>
              {editable && (
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="sm" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label="Move down" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label={a.isVisible ? 'Hide from page' : 'Show on page'} disabled={busy} onClick={() => void act(() => api.patch(`${base}/${a.id}`, { isVisible: !a.isVisible }))}>
                    {a.isVisible ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Edit" disabled={busy} onClick={() => setEditing(a)}><Pencil aria-hidden className="h-4 w-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <AchievementModal base={base} orgId={org.orgId} a={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => q.reload()} />}
    </Card>
  );
}

function AchievementThumb({ orgId, a, className }: { orgId: string; a: Achievement; className?: string }) {
  const src = useAuthedImage(a.imageUrl ? `/organizations/${orgId}/achievements/${a.id}/image?size=thumb&v=${encodeURIComponent(a.updatedAt)}` : null);
  const Icon = ACHIEVEMENT_ICON[a.icon] ?? Trophy;
  return (
    <span className={cx('flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-600', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon aria-hidden className="h-7 w-7" />}
    </span>
  );
}

function AchievementModal({ base, orgId, a, onClose, onSaved }: { base: string; orgId: string; a: Achievement | null; onClose: () => void; onSaved: () => void }) {
  const [cur, setCur] = useState<Achievement | null>(a);
  const [f, setF] = useState({
    title: a?.title ?? '',
    year: a?.year ? String(a.year) : '',
    awardedBy: a?.awardedBy ?? '',
    description: a?.description ?? '',
    icon: a?.icon ?? ('TROPHY' as AchievementIcon),
    isVisible: a?.isVisible ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      onSaved();
      return r;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title: f.title.trim(),
      year: f.year.trim() ? Number(f.year) : null,
      awardedBy: f.awardedBy.trim() || null,
      description: f.description.trim() || null,
      icon: f.icon,
      isVisible: f.isVisible,
    };
    const r = await run(() => (cur ? api.patch<Achievement>(`${base}/${cur.id}`, body) : api.post<Achievement>(base, body)));
    if (!r) return;
    if (cur) onClose();
    else setCur(r); // stay open so a photo can be added
  }

  async function upload(file: File | undefined) {
    if (!file || !cur) return;
    if (!IMAGE_TYPES.test(file.type)) return setError('Choose a PNG, JPG or WebP image.');
    await run(async () => {
      const full = await resizeImage(file, { max: 1600, quality: 0.85, maxBytes: 1.9 * 1024 * 1024 });
      const thumb = await resizeImage(full.blob, { max: 400, quality: 0.8, maxBytes: 280 * 1024 });
      const form = new FormData();
      form.append('file', full.blob, `trophy.${full.blob.type.split('/')[1]}`);
      form.append('thumb', thumb.blob, `thumb.${thumb.blob.type.split('/')[1]}`);
      setCur(await uploadForm<Achievement>(`${base}/${cur.id}/image`, form, { method: 'PUT' }));
    });
    if (picker.current) picker.current.value = '';
  }

  async function remove() {
    if (!cur || !confirm(`Delete “${cur.title}”?`)) return;
    if (await run(() => api.del(`${base}/${cur.id}`).then(() => true))) onClose();
  }

  return (
    <Modal open onClose={onClose} title={cur ? 'Edit trophy / award' : 'Add trophy / award'}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <LabeledInput label="Title" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Best Pandal Decoration" />
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledInput label="Year" inputMode="numeric" maxLength={4} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '') })} placeholder="2025" />
          <LabeledInput label="Awarded by" maxLength={120} value={f.awardedBy} onChange={(e) => setF({ ...f, awardedBy: e.target.value })} placeholder="e.g. Pune Municipal Corporation" />
        </div>
        <Field label="Description (optional)">
          <Textarea rows={3} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Icon" hint="Shown when there is no photo.">
          <div className="flex flex-wrap gap-2">
            {ACHIEVEMENT_ICONS.map((k) => {
              const Icon = ACHIEVEMENT_ICON[k];
              return (
                <button key={k} type="button" aria-pressed={f.icon === k} onClick={() => setF({ ...f, icon: k })} className={cx('flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold', f.icon === k ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-orange-200')}>
                  <Icon aria-hidden className="h-4 w-4" /> {ICON_LABEL[k]}
                </button>
              );
            })}
          </div>
        </Field>
        <Checkbox label="Show on the landing page" checked={f.isVisible} onChange={(v) => setF({ ...f, isVisible: v })} />
        {cur && (
          <Field label="Photo (optional)">
            <div className="flex items-center gap-3">
              <AchievementThumb orgId={orgId} a={cur} className="h-20 w-20" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => picker.current?.click()}><ImagePlus aria-hidden className="h-4 w-4" /> {cur.imageUrl ? 'Replace' : 'Upload'}</Button>
                {cur.imageUrl && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => setCur(await api.del<Achievement>(`${base}/${cur.id}/image`)))}>Remove photo</Button>
                )}
              </div>
            </div>
            <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>{cur ? 'Save' : 'Add'}</Button>
          {cur && a === null && <Button variant="secondary" onClick={onClose}>Done</Button>}
          {cur && <Button variant="ghost" className="ml-auto text-red-700" disabled={busy} onClick={() => void remove()}><Trash2 aria-hidden className="h-4 w-4" /> Delete</Button>}
        </div>
      </form>
    </Modal>
  );
}
