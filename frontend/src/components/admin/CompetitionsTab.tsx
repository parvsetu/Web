'use client';

import { useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Download, ExternalLink, Layers, ListChecks, Medal, Pencil, Plus, ScanLine, Search, Trash2, Trophy, Undo2, X,
} from 'lucide-react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { festivalDays } from '@/lib/booking';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { Paged } from '@/lib/types';
import {
  COMPETITION_KINDS, KIND_EMOJI, type AdminCompetition, type AdminEntry, type CategoryGender, type CompetitionKind, type ResultStatus, type ResultType,
} from '@/lib/competition-types';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, LabeledSelect, Modal, SkeletonList, Textarea } from '../ui';

const KIND_LABEL: Record<CompetitionKind, string> = { SWIMMING: 'Swimming', RUNNING: 'Running / race', DANCE: 'Dance', ART: 'Art / drawing / rangoli', QUIZ: 'Quiz', SPORTS: 'Sports', OTHER: 'Other' };
const RESULT_LABEL: Record<ResultType, string> = { TIME: 'Fastest time wins', SCORE: 'Highest score wins', RANK: 'Judges place 1st, 2nd, 3rd…' };

/** Festival admin → Competitions: set up, entries, check-in, heats, results, refunds. */
export function CompetitionsTab() {
  const ev = useEvent();
  const q = useAsync(() => api.get<AdminCompetition[]>(`/events/${ev.eventId}/competitions`), [ev.eventId]);
  const [editing, setEditing] = useState<AdminCompetition | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = q.data ?? [];
  const current = list.find((c) => c.id === open);

  async function remove(c: AdminCompetition) {
    if (!window.confirm(`Delete “${c.name}”? This only works while nobody has paid.`)) return;
    setError(null);
    try {
      await api.del(`/events/${ev.eventId}/competitions/${c.id}`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (current) return <EntriesPanel c={current} onBack={() => { setOpen(null); q.reload(); }} onChanged={q.reload} />;

  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        Run swimming, dhunuchi, rangoli, drawing, garba, quiz and other competitions. Each competition has <strong>categories</strong> (age group, boys / girls,
        own fee and spots). People enter from the festival page and <strong>pay the fee online</strong>; under-18s need a parent&apos;s consent. On the day, check
        people in by QR or bib number, split swimmers into heats, record results and publish them — everyone gets a certificate.
      </Alert>
      <div className="flex flex-wrap justify-between gap-2">
        {list.length > 0 && (
          <a href={`/e/${ev.eventId}/competition-checkin`} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 font-semibold text-emerald-800">
            <ScanLine aria-hidden className="h-4 w-4" /> Check-in at the venue
          </a>
        )}
        <Button onClick={() => setEditing('new')} className="ml-auto"><Plus aria-hidden className="h-4 w-4" /> Add competition</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        <Empty title="No competitions yet" icon={Trophy}>Add one — e.g. “Swimming championship” with Under-10, Under-14 and Open categories.</Empty>
      ) : (
        list.map((c) => {
          const paid = c.categories.reduce((n, x) => n + x.paid, 0);
          const checked = c.categories.reduce((n, x) => n + x.checkedIn, 0);
          return (
            <Card key={c.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{KIND_EMOJI[c.kind]} {KIND_LABEL[c.kind]} · {fmtDate(c.date)} · {c.startTime}{c.venue ? ` · ${c.venue}` : ''}</p>
                  <h3 className="text-lg font-extrabold">{c.name}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                    <Badge className={c.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}>{c.isPublished ? 'Published' : 'Draft'}</Badge>
                    <Badge className={c.registrationOpen ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}>{c.registrationOpen ? 'Entries open' : 'Entries closed'}</Badge>
                    {c.resultsPublished && <Badge className="bg-amber-100 text-amber-900">Results published</Badge>}
                    {c.setting && <Badge className="bg-lime-100 text-lime-900">{c.setting === 'OUTDOOR' ? 'Outdoor' : 'Indoor'}</Badge>}
                    {c.lanes && <Badge className="bg-indigo-100 text-indigo-800">{c.lanes} lanes</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setOpen(c.id)}><ListChecks aria-hidden className="h-4 w-4" /> Entries ({paid})</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(c)}><Pencil aria-hidden className="h-4 w-4" /> Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 aria-hidden className="h-4 w-4" /></Button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
                {c.categories.map((x) => (
                  <li key={x.id} className={cx('flex flex-wrap items-center justify-between gap-2 px-3 py-2', !x.isActive && 'opacity-50')}>
                    <span className="font-semibold">{x.name}{!x.isActive && ' (inactive)'}</span>
                    <span className="text-slate-600">
                      {Number(x.fee) > 0 ? `₹${Number(x.fee)}` : 'Free'} · {x.paid}{x.capacity ? ` / ${x.capacity}` : ''} entered · {x.checkedIn} checked in
                    </span>
                  </li>
                ))}
              </ul>
              {paid > 0 && <p className="text-xs text-slate-500">{checked} of {paid} checked in.</p>}
            </Card>
          );
        })
      )}
      {editing && (
        <CompetitionForm
          c={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); q.reload(); }}
        />
      )}
      {ev.slug && list.some((c) => c.isPublished) && (
        <a href={`/f/${ev.slug}#competitions`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-end text-sm font-semibold text-brand-700">
          <ExternalLink aria-hidden className="h-4 w-4" /> See it on the public page
        </a>
      )}
    </div>
  );
}

// ─── Set-up form ───────────────────────────────────────────────────────

interface CatRow { key: string; id?: string; name: string; gender: CategoryGender; minAge: string; maxAge: string; fee: string; capacity: string; isActive: boolean }
let seq = 0;
const blankCat = (p: Partial<CatRow> = {}): CatRow => ({ key: `n${++seq}`, name: '', gender: 'ANY', minAge: '', maxAge: '', fee: '', capacity: '', isActive: true, ...p });

/** Typical swimming age groups, as a starting point. */
function swimmingPreset(): CatRow[] {
  const groups: [string, number | '', number | ''][] = [['Under 10', 6, 9], ['Under 14', 10, 13], ['Under 18', 14, 17], ['Open', 18, '']];
  return groups.flatMap(([g, min, max]) => (['FEMALE', 'MALE'] as const).map((gen) => blankCat({
    name: `50 m freestyle · ${g} · ${gen === 'FEMALE' ? (g === 'Open' ? 'Women' : 'Girls') : g === 'Open' ? 'Men' : 'Boys'}`, gender: gen, minAge: String(min), maxAge: String(max), fee: '200', capacity: '24',
  })));
}

function CompetitionForm({ c, onClose, onSaved }: { c: AdminCompetition | null; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const days = festivalDays(ev.startDate, ev.endDate);
  const [name, setName] = useState(c?.name ?? '');
  const [kind, setKind] = useState<CompetitionKind>(c?.kind ?? 'SWIMMING');
  const [resultType, setResultType] = useState<ResultType>(c?.resultType ?? 'TIME');
  const [date, setDate] = useState(c?.date ?? days[0] ?? '');
  const [startTime, setStart] = useState(c?.startTime ?? '');
  const [venue, setVenue] = useState(c?.venue ?? '');
  const [setting, setSetting] = useState<'INDOOR' | 'OUTDOOR' | ''>(c?.setting ?? '');
  const [lanes, setLanes] = useState(c?.lanes ? String(c.lanes) : '');
  const [description, setDescription] = useState(c?.description ?? '');
  const [rules, setRules] = useState(c?.rules ?? '');
  const [safety, setSafety] = useState(c?.safetyDeclaration ?? '');
  const [regOpen, setRegOpen] = useState(c?.registrationOpen ?? false);
  const [closesAt, setClosesAt] = useState(c?.registrationClosesAt ? c.registrationClosesAt.slice(0, 16) : '');
  const [published, setPublished] = useState(c?.isPublished ?? false);
  const [cats, setCats] = useState<CatRow[]>(
    c?.categories.map((x) => ({ key: x.id, id: x.id, name: x.name, gender: x.gender, minAge: x.minAge?.toString() ?? '', maxAge: x.maxAge?.toString() ?? '', fee: Number(x.fee) > 0 ? String(Number(x.fee)) : '', capacity: x.capacity?.toString() ?? '', isActive: x.isActive })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (key: string, p: Partial<CatRow>) => setCats((cs) => cs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  function pickKind(k: CompetitionKind) {
    setKind(k);
    if (!c) {
      setResultType(k === 'SWIMMING' || k === 'RUNNING' ? 'TIME' : k === 'QUIZ' ? 'SCORE' : 'RANK');
      if (k === 'SWIMMING') {
        setLanes((l) => l || '6');
        setSafety((s) => s || 'The participant can swim at least 25 m without help and has no medical condition that makes swimming unsafe.');
        setSetting((s) => s || 'OUTDOOR');
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Enter a name, e.g. “Swimming championship”.');
    if (!startTime) return setError('Enter a start time.');
    const bad = cats.find((x) => x.name.trim().length < 2);
    if (bad) return setError('Every category needs a name.');
    const body = {
      name: name.trim(), kind, resultType, date, startTime, venue, setting: setting || null, lanes: num(lanes),
      description, rules, safetyDeclaration: safety, registrationOpen: regOpen, isPublished: published,
      registrationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
      categories: cats.map((x) => ({
        ...(x.id ? { id: x.id } : {}), name: x.name.trim(), gender: x.gender, minAge: num(x.minAge), maxAge: num(x.maxAge),
        fee: x.fee.trim() || '0', capacity: num(x.capacity), isActive: x.isActive,
      })),
    };
    setBusy(true);
    try {
      const r = c
        ? await api.patch<AdminCompetition & { keptInactive?: string[] }>(`/events/${ev.eventId}/competitions/${c.id}`, body)
        : await api.post<AdminCompetition>(`/events/${ev.eventId}/competitions`, body);
      const kept = (r as { keptInactive?: string[] }).keptInactive ?? [];
      if (kept.length) {
        setNotice(`Kept as inactive because people already entered: ${kept.join(', ')}.`);
        setBusy(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={notice ? onSaved : onClose} title={c ? 'Edit competition' : 'Add competition'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput required label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Swimming championship" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect label="Kind" value={kind} onChange={(e) => pickKind(e.target.value as CompetitionKind)}>
            {COMPETITION_KINDS.map((k) => <option key={k} value={k}>{KIND_EMOJI[k]} {KIND_LABEL[k]}</option>)}
          </LabeledSelect>
          <LabeledSelect label="How results work" value={resultType} onChange={(e) => setResultType(e.target.value as ResultType)}>
            {(['TIME', 'SCORE', 'RANK'] as ResultType[]).map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
          </LabeledSelect>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <LabeledSelect label="Day" value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {fmtDate(d)}</option>)}
          </LabeledSelect>
          <LabeledInput required label="Starts" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
          <LabeledInput label="Venue" value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} placeholder="Municipal pool" />
          <LabeledInput label="Lanes (heats)" type="number" min={2} max={12} value={lanes} onChange={(e) => setLanes(e.target.value)} placeholder="none" hint="Swimming / running" />
        </div>
        <Field label="Indoor / outdoor">
          <div className="flex gap-2">
            {([['', 'Not set'], ['INDOOR', 'Indoor'], ['OUTDOOR', 'Outdoor']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSetting(v)} aria-pressed={setting === v}
                className={cx('min-h-[44px] flex-1 rounded-xl border-2 px-2 text-sm font-semibold', setting === v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600')}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="About (shown on the festival page)">
          <Textarea rows={2} value={description} maxLength={3000} onChange={(e) => setDescription(e.target.value)} placeholder="Inter-society swimming meet for all ages. Swimming caps provided." />
        </Field>
        <Field label="Rules (entrants accept these)">
          <Textarea rows={3} value={rules} maxLength={5000} onChange={(e) => setRules(e.target.value)} placeholder="Report 30 minutes early with your bib. Costume and cap compulsory. Judges' decision is final." />
        </Field>
        <Field label="Safety declaration (entrants tick this)" hint="Parents' consent for under-18s is always asked as well.">
          <Textarea rows={2} value={safety} maxLength={1000} onChange={(e) => setSafety(e.target.value)} />
        </Field>

        <fieldset className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-bold">Categories</legend>
          {cats.length === 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              Add age groups / events, each with its own fee and spots.
              {kind === 'SWIMMING' && <Button type="button" size="sm" variant="secondary" onClick={() => setCats(swimmingPreset())}>Use typical swimming age groups</Button>}
            </div>
          )}
          {cats.map((x) => (
            <div key={x.key} className={cx('grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[2fr_1fr_0.7fr_0.7fr_0.8fr_0.8fr_auto]', !x.isActive && 'opacity-60')}>
              <LabeledInput required label="Name" value={x.name} maxLength={100} onChange={(e) => patch(x.key, { name: e.target.value })} placeholder="50 m freestyle · Under 14 · Girls" />
              <LabeledSelect label="Who" value={x.gender} onChange={(e) => patch(x.key, { gender: e.target.value as CategoryGender })}>
                <option value="ANY">Anyone</option><option value="FEMALE">Girls / women</option><option value="MALE">Boys / men</option>
              </LabeledSelect>
              <LabeledInput label="Min age" type="number" min={3} max={100} value={x.minAge} onChange={(e) => patch(x.key, { minAge: e.target.value })} />
              <LabeledInput label="Max age" type="number" min={3} max={100} value={x.maxAge} onChange={(e) => patch(x.key, { maxAge: e.target.value })} />
              <LabeledInput label="Fee ₹" inputMode="decimal" value={x.fee} onChange={(e) => patch(x.key, { fee: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0 = free" />
              <LabeledInput label="Spots" type="number" min={1} value={x.capacity} onChange={(e) => patch(x.key, { capacity: e.target.value })} placeholder="no limit" />
              <div className="col-span-2 flex items-end justify-end gap-1 sm:col-span-1">
                {x.id && <Checkbox label="On" checked={x.isActive} onChange={(v) => patch(x.key, { isActive: v })} />}
                <Button type="button" size="sm" variant="ghost" className="text-red-700" onClick={() => setCats((cs) => cs.filter((y) => y.key !== x.key))} aria-label="Remove category"><Trash2 aria-hidden className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setCats((cs) => [...cs, blankCat()])}><Plus aria-hidden className="h-4 w-4" /> Add category</Button>
          <p className="text-xs text-slate-500">Age is the participant&apos;s age on the competition day. Fees are paid online only; GST is added on top when this festival charges GST. Existing entries keep the fee they paid.</p>
        </fieldset>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col">
            <Checkbox label="Published — show on the festival page" checked={published} onChange={setPublished} />
            <Checkbox label="Entries open — people can register and pay" checked={regOpen} onChange={setRegOpen} />
          </div>
          <LabeledInput label="Entries close at (optional)" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="warning">{notice}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={notice ? onSaved : onClose}>{notice ? 'Close' : 'Cancel'}</Button>
          {!notice && <Button type="submit" loading={busy}>{c ? 'Save changes' : 'Add competition'}</Button>}
        </div>
      </form>
    </Modal>
  );
}

// ─── Entries, check-in, heats, results ─────────────────────────────────

function EntriesPanel({ c, onBack, onChanged }: { c: AdminCompetition; onBack: () => void; onChanged: () => void }) {
  const ev = useEvent();
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<'' | 'PAID' | 'CANCELLED' | 'PENDING'>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const base = `/events/${ev.eventId}/competitions/${c.id}`;
  const q = useAsync(
    () => api.get<Paged<AdminEntry>>(`${base}/entries`, { categoryId: categoryId || undefined, status: status || undefined, q: search || undefined, page, pageSize: 50 }),
    [base, categoryId, status, search, page],
  );
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [bib, setBib] = useState('');
  const [cancelling, setCancelling] = useState<AdminEntry | null>(null);
  const [resultsPublished, setResultsPublished] = useState(c.resultsPublished);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ kind: 'success', text: ok });
      q.reload();
      onChanged();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function checkInBib(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(bib);
    if (!n) return;
    await run(async () => {
      const r = await api.post<{ alreadyCheckedIn: boolean; entry: AdminEntry }>(`${base}/check-in`, { bibNo: n });
      setMsg({ kind: 'success', text: `${r.alreadyCheckedIn ? 'Already checked in' : 'Checked in'}: #${r.entry.bibNo} ${r.entry.participantName} — ${r.entry.category.name}` });
    });
    setBib('');
  }

  async function heats() {
    if (!categoryId) return setMsg({ kind: 'error', text: 'Pick a category first (heats are per category).' });
    await run(async () => {
      const r = await api.post<{ heats: number; entries: number }>(`${base}/heats`, { categoryId });
      setMsg({ kind: 'success', text: `${r.entries} checked-in entrants split into ${r.heats} heat${r.heats === 1 ? '' : 's'} of up to ${c.lanes} lanes.` });
    });
  }

  async function togglePublish() {
    const next = !resultsPublished;
    if (next && !window.confirm('Publish results? Everyone can then see names (first name + initial), places and certificates.')) return;
    await run(async () => {
      await api.patch(`/events/${ev.eventId}/competitions/${c.id}`, { resultsPublished: next });
      setResultsPublished(next);
    }, next ? 'Results published.' : 'Results hidden again.');
  }

  const rows = q.data?.items ?? [];
  const showHeats = !!c.lanes;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden className="h-4 w-4" /> All competitions</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadFile(`${base}/entries.csv`, {}, `${c.name}-entries.csv`).catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }))}>
            <Download aria-hidden className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant={resultsPublished ? 'secondary' : 'primary'} onClick={togglePublish}>
            <Medal aria-hidden className="h-4 w-4" /> {resultsPublished ? 'Hide results' : 'Publish results'}
          </Button>
        </div>
      </div>
      <Card className="flex flex-col gap-1">
        <h3 className="text-lg font-extrabold">{KIND_EMOJI[c.kind]} {c.name}</h3>
        <p className="text-sm text-slate-600">{fmtDate(c.date)} · {c.startTime} · {RESULT_LABEL[c.resultType]}{c.lanes ? ` · ${c.lanes} lanes` : ''}</p>
      </Card>

      <form onSubmit={checkInBib} className="flex flex-wrap items-end gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="w-36"><LabeledInput required label="Check in bib no." inputMode="numeric" value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} /></div>
        <Button type="submit" disabled={!bib}><CheckCircle2 aria-hidden className="h-4 w-4" /> Check in</Button>
        <a href={`/e/${ev.eventId}/competition-checkin?c=${c.id}`} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-emerald-800 underline">
          <ScanLine aria-hidden className="h-4 w-4" /> Scan QR codes
        </a>
      </form>

      {msg && <Alert kind={msg.kind === 'success' ? 'success' : 'error'}>{msg.text}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <LabeledSelect label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {c.categories.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.paid})</option>)}
          </LabeledSelect>
        </div>
        <div className="w-52">
          <LabeledSelect label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="">Paid + cancelled</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option><option value="PENDING">Awaiting payment</option>
          </LabeledSelect>
        </div>
        <div className="min-w-[180px] flex-1">
          <LabeledInput label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, phone or bib" />
        </div>
        {showHeats && (
          <Button variant="secondary" onClick={heats} disabled={!categoryId} title={categoryId ? '' : 'Pick a category'}>
            <Layers aria-hidden className="h-4 w-4" /> Assign heats
          </Button>
        )}
      </div>
      {showHeats && <p className="-mt-2 text-xs text-slate-500">Assign heats splits the checked-in entrants of the chosen category evenly, fastest-friendly middle lanes first. Running it again reshuffles.</p>}

      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : rows.length === 0 ? (
        <Empty title="No entries" icon={Search}>Nobody matches — or entries haven&apos;t started yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((e) => (
            <EntryRow key={e.id} e={e} resultType={c.resultType} base={`/events/${ev.eventId}`} competitionBase={base} showHeats={showHeats} onDone={run} onCancel={() => setCancelling(e)} />
          ))}
        </ul>
      )}
      {q.data && q.data.total > q.data.pageSize && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="self-center text-sm">Page {page} of {Math.ceil(q.data.total / q.data.pageSize)}</span>
          <Button size="sm" variant="secondary" disabled={page * q.data.pageSize >= q.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
      {cancelling && <CancelForm e={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); q.reload(); onChanged(); }} />}
    </div>
  );
}

function EntryRow({ e, resultType, base, competitionBase, showHeats, onDone, onCancel }: {
  e: AdminEntry; resultType: ResultType; base: string; competitionBase: string; showHeats: boolean;
  onDone: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rs, setRs] = useState<ResultStatus>(e.resultStatus ?? 'FINISHED');
  const [value, setValue] = useState(resultType === 'TIME' ? (e.resultStatus === 'FINISHED' ? e.result ?? '' : '') : resultType === 'SCORE' ? e.resultScore ?? '' : e.rank?.toString() ?? '');
  const [heat, setHeat] = useState(e.heat?.toString() ?? '');
  const [lane, setLane] = useState(e.lane?.toString() ?? '');
  const paid = e.status === 'PAID';

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const body: Record<string, unknown> = { resultStatus: rs };
    if (rs === 'FINISHED') {
      if (resultType === 'TIME') body.time = value;
      if (resultType === 'SCORE') body.score = value;
      if (resultType === 'RANK') body.rank = value ? Number(value) : null;
    }
    if (showHeats) {
      body.heat = heat ? Number(heat) : null;
      body.lane = lane ? Number(lane) : null;
    }
    void onDone(() => api.patch(`${base}/competition-entries/${e.id}/result`, body), `Saved ${e.participantName}.`).then(() => setOpen(false));
  }

  return (
    <li className={cx('rounded-xl border bg-white p-3', paid ? 'border-slate-200' : 'border-red-200 bg-red-50/40')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 font-mono text-lg font-extrabold text-white">{e.bibNo ?? '–'}</span>
          <div className="min-w-0">
            <p className="font-bold">{e.participantName} <span className="font-normal text-slate-500">· {e.ageOnDay} y · {e.gender.toLowerCase()}</span></p>
            <p className="text-sm text-slate-600">{e.category.name}</p>
            <p className="text-xs text-slate-500">
              {e.phone}{e.guardianName ? ` · guardian ${e.guardianName} ${e.guardianPhone ?? ''}` : ''} · emergency {e.emergencyName} {e.emergencyPhone}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
              <Badge value={e.status} />
              {Number(e.amount) > 0 && <Badge className="bg-slate-100 text-slate-700">₹{e.amount}</Badge>}
              {e.checkedInAt && <Badge className="bg-emerald-100 text-emerald-800">Checked in {fmtDateTime(e.checkedInAt).split(',').pop()}</Badge>}
              {e.heat !== null && <Badge className="bg-indigo-100 text-indigo-800">Heat {e.heat} · Lane {e.lane}</Badge>}
              {e.resultStatus && <Badge className="bg-amber-100 text-amber-900">{e.result ?? e.resultStatus}{e.rank ? ` · #${e.rank}` : ''}</Badge>}
              {e.status === 'CANCELLED' && <Badge className="bg-red-100 text-red-800">Refund ₹{e.refund}</Badge>}
            </div>
          </div>
        </div>
        {paid && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={e.checkedInAt ? 'ghost' : 'secondary'} onClick={() => onDone(() => api.post(`${competitionBase}/check-in`, { entryId: e.id, checkedIn: !e.checkedInAt }))}>
              {e.checkedInAt ? <><Undo2 aria-hidden className="h-4 w-4" /> Undo check-in</> : <><CheckCircle2 aria-hidden className="h-4 w-4" /> Check in</>}
            </Button>
            <Button size="sm" onClick={() => setOpen((o) => !o)}><Medal aria-hidden className="h-4 w-4" /> Result</Button>
            <Button size="sm" variant="ghost" className="text-red-700" onClick={onCancel} aria-label={`Cancel ${e.participantName}`}><X aria-hidden className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      {open && paid && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <div className="w-36">
            <LabeledSelect label="Outcome" value={rs} onChange={(ev) => setRs(ev.target.value as ResultStatus)}>
              <option value="FINISHED">Finished</option><option value="DNF">Did not finish</option><option value="DNS">Did not start</option><option value="DQ">Disqualified</option>
            </LabeledSelect>
          </div>
          {rs === 'FINISHED' && (
            <div className="w-40">
              <LabeledInput
                label={resultType === 'TIME' ? 'Time (m:ss.hh)' : resultType === 'SCORE' ? 'Score' : 'Place (1, 2, 3…)'}
                value={value} onChange={(ev) => setValue(ev.target.value)} inputMode={resultType === 'TIME' ? 'text' : 'decimal'}
                placeholder={resultType === 'TIME' ? '0:41.25' : resultType === 'SCORE' ? '8.5' : '1'}
              />
            </div>
          )}
          {showHeats && (
            <>
              <div className="w-20"><LabeledInput label="Heat" type="number" min={1} value={heat} onChange={(ev) => setHeat(ev.target.value)} /></div>
              <div className="w-20"><LabeledInput label="Lane" type="number" min={1} value={lane} onChange={(ev) => setLane(ev.target.value)} /></div>
            </>
          )}
          <Button type="submit">Save</Button>
          {e.resultStatus && <Button type="button" variant="ghost" onClick={() => onDone(() => api.del(`${base}/competition-entries/${e.id}/result`), 'Result cleared.')}>Clear</Button>}
          {resultType !== 'RANK' && <p className="w-full text-xs text-slate-500">Places are worked out automatically from {resultType === 'TIME' ? 'times (fastest first)' : 'scores (highest first)'}; ties share a place.</p>}
        </form>
      )}
    </li>
  );
}

function CancelForm({ e, onClose, onDone }: { e: AdminEntry; onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(e.amount);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(x: React.FormEvent) {
    x.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${ev.eventId}/competition-entries/${e.id}/cancel`, { reason, refund: refund || '0', refundReference: ref || undefined });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancel entry — ${e.participantName}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <LabeledInput required label="Reason (shown to the entrant)" value={reason} onChange={(x) => setReason(x.target.value)} maxLength={300} placeholder="Category cancelled — not enough entries" />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label={`Refund ₹ (paid ₹${e.amount})`} inputMode="decimal" value={refund} onChange={(x) => setRefund(x.target.value.replace(/[^\d.]/g, ''))} />
          <LabeledInput label="Refund reference (UPI / bank)" value={ref} onChange={(x) => setRef(x.target.value)} maxLength={100} />
        </div>
        <p className="text-xs text-slate-500">Send the refund yourself (UPI / bank); it is deducted from your next payout, and the platform fee is returned pro rata.</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Keep entry</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={reason.trim().length < 3}>Cancel entry</Button>
        </div>
      </form>
    </Modal>
  );
}
