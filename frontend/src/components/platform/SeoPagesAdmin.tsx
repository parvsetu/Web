'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { CATEGORIES } from '@/lib/explore';
import { fmtDateTime } from '@/lib/format';
import { LANGUAGES } from '@/lib/i18n/config';
import { usePagedList } from '@/lib/paged';
import { citySlug, type SeoKind } from '@/lib/seo-content';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SkeletonList, Textarea } from '../ui';
import { SeoText } from '../SeoText';

interface SeoPageRow {
  id: string;
  kind: SeoKind;
  key: string;
  lang: string;
  name: string | null;
  title: string | null;
  metaDescription: string | null;
  aboveText: string | null;
  belowText: string | null;
  published: boolean;
  updatedAt: string;
}

const KIND_LABEL: Record<SeoKind, string> = { HOME: 'Home page', CITY: 'City page', CATEGORY: 'Category page' };
const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.english ?? code;
const catName = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

function pagePath(r: Pick<SeoPageRow, 'kind' | 'key'>) {
  return r.kind === 'HOME' ? '/' : r.kind === 'CITY' ? `/city/${r.key}` : `/category/${r.key}`;
}

function rowLabel(r: SeoPageRow) {
  return r.kind === 'HOME' ? 'Home page' : r.kind === 'CITY' ? r.name || r.key : catName(r.key);
}

/** Super admin: SEO text above and below the festival grid on the home, city and category pages. */
export function SeoPagesAdmin() {
  const [kind, setKind] = useState('');
  const q = usePagedList<SeoPageRow>('/platform/seo-pages', { kind: kind || undefined }, { pageSize: 30 });
  const [editing, setEditing] = useState<SeoPageRow | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Text above and below the festival grid on the explore pages, for search engines and visitors. City pages live at <code>/city/&lt;city&gt;</code> and category pages at <code>/category/&lt;category&gt;</code>. Every city with a live festival already has a page, and you can add text to it here. Each page can have a version per language; English is used when a language has none. Only published pages show.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="sm:w-56">
          <LabeledSelect label="Page type" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All</option>
            {(Object.keys(KIND_LABEL) as SeoKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </LabeledSelect>
        </div>
        <Button onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> New SEO page</Button>
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : q.items.length === 0 ? <Empty icon={FileText} title="No SEO pages yet" /> : (
        q.items.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words font-bold">{rowLabel(r)}</span>
                <span className="text-sm text-slate-500">{KIND_LABEL[r.kind]} · {langName(r.lang)}</span>
                <Badge className={r.published ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}>{r.published ? 'Published' : 'Draft'}</Badge>
              </div>
              <p className="truncate text-sm text-slate-600">{r.title || 'Default title'} · updated {fmtDateTime(r.updatedAt)}</p>
            </div>
            <div className="flex gap-2">
              <a href={`${pagePath(r)}${r.lang !== 'en' ? `?lang=${r.lang}` : ''}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                Open <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button>
            </div>
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {editing && <Editor row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); q.reload(); }} />}
    </div>
  );
}

function Editor({ row, onClose, onDone }: { row: SeoPageRow | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    kind: (row?.kind ?? 'CITY') as SeoKind,
    city: row?.kind === 'CITY' ? row.name || row.key : '',
    category: row?.kind === 'CATEGORY' ? row.key : CATEGORIES[0].key,
    lang: row?.lang ?? 'en',
    title: row?.title ?? '',
    metaDescription: row?.metaDescription ?? '',
    aboveText: row?.aboveText ?? '',
    belowText: row?.belowText ?? '',
    published: row?.published ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const slug = citySlug(form.city);
  const key = form.kind === 'HOME' ? '' : form.kind === 'CITY' ? slug : form.category;
  const locked = !!row; // kind / page / language are the row's identity

  async function save() {
    setError(null);
    if (form.kind === 'CITY' && !slug) return setError('Enter the city name.');
    setBusy(true);
    try {
      await api.put('/platform/seo-pages', {
        kind: form.kind, key, lang: form.lang,
        ...(form.kind === 'CITY' ? { name: form.city.trim() } : {}),
        title: form.title, metaDescription: form.metaDescription, aboveText: form.aboveText, belowText: form.belowText, published: form.published,
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!row || !window.confirm('Delete this SEO page? The page itself stays, without this text.')) return;
    setBusy(true);
    try {
      await api.del(`/platform/seo-pages/${row.id}`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={row ? `Edit SEO page — ${rowLabel(row)}` : 'New SEO page'} wide>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledSelect label="Page type" value={form.kind} onChange={set('kind')} disabled={locked}>
            {(Object.keys(KIND_LABEL) as SeoKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </LabeledSelect>
          {form.kind === 'CITY' && (
            <LabeledInput label="City" required value={form.city} onChange={set('city')} disabled={locked} placeholder="e.g. Navi Mumbai" hint={slug ? `Page: /city/${slug}` : undefined} />
          )}
          {form.kind === 'CATEGORY' && (
            <LabeledSelect label="Category" value={form.category} onChange={set('category')} disabled={locked}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </LabeledSelect>
          )}
          <LabeledSelect label="Language" value={form.lang} onChange={set('lang')} disabled={locked}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.english}</option>)}
          </LabeledSelect>
        </div>
        <LabeledInput label="Page title (optional)" value={form.title} maxLength={120} onChange={set('title')} hint={`Shown in Google and as the page heading. ${form.title.length}/60 recommended.`} />
        <Field label="Meta description (optional)">
          <Textarea value={form.metaDescription} maxLength={320} rows={2} onChange={set('metaDescription')} />
          <p className="mt-1 text-xs text-slate-500">The snippet under the title in Google. {form.metaDescription.length}/160 recommended.</p>
        </Field>
        <Field label="Above the festival grid">
          <Textarea value={form.aboveText} maxLength={2000} rows={4} onChange={set('aboveText')} placeholder="One or two short paragraphs introducing festivals in this city or category." />
        </Field>
        <Field label="Below the festival grid">
          <Textarea value={form.belowText} maxLength={20000} rows={10} onChange={set('belowText')} placeholder={'## Ganesh Utsav in Pune\nThe city’s mandals …\n\n- Best time to visit: evenings\n- [Book passes](/category/festivals)'} />
        </Field>
        <p className="text-xs text-slate-500">
          Formatting: a blank line starts a new paragraph · <code>## </code> or <code>### </code> starts a heading · lines starting <code>- </code> make a list · <code>**bold**</code> · <code>[link text](/city/pune)</code> or a full https:// link.
        </p>
        <Checkbox label="Published (shown on the site)" checked={form.published} onChange={(v) => setForm((f) => ({ ...f, published: v }))} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} loading={busy}>Save</Button>
          <Button variant="secondary" onClick={() => setPreview((v) => !v)}>{preview ? 'Hide preview' : 'Preview text'}</Button>
          {row && <Button variant="secondary" onClick={() => void remove()} disabled={busy}><Trash2 aria-hidden className="h-4 w-4" /> Delete</Button>}
        </div>
        {preview && (
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-[#f7f5f2] p-4">
            <SeoText text={form.aboveText} />
            <p className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Festival grid</p>
            <SeoText text={form.belowText} />
          </div>
        )}
      </div>
    </Modal>
  );
}
