'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Copy, ExternalLink, EyeOff, ImagePlus, Pencil, Plus, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { api, errorMessage, uploadForm } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { fmtDate } from '@/lib/format';
import { IMAGE_TYPES, resizeImage, useAuthedImage } from '@/lib/images';
import { cx } from '@/lib/cx';
import {
  CATEGORY_STYLE, PROGRAMME_CATEGORIES, type AdminProgramme, type AdminProgrammeItem, type ProgrammeCategory, type ProgrammeSetting,
} from '@/lib/programme-types';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, LabeledSelect, Modal, SkeletonList, Textarea } from '../ui';

const CATEGORY_LABEL: Record<ProgrammeCategory, string> = {
  PERFORMANCE: 'Performance', PUJA: 'Puja', CULTURAL: 'Cultural', COMPETITION: 'Competition', CHIEF_GUEST: 'Chief guest', WORKSHOP: 'Workshop', OTHER: 'Other',
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Day = AdminProgramme['days'][number];

/** Day-by-day festival programme: performances, pujas, competitions, guests — shown on the public festival page. */
export function ProgrammeTab() {
  const ev = useEvent();
  const editable = can(ev.perms, 'EVENT_UPDATE');
  const q = useAsync(() => api.get<AdminProgramme>(`/events/${ev.eventId}/programme`), [ev.eventId]);
  const [editing, setEditing] = useState<{ item: AdminProgrammeItem | null; date: string } | null>(null);
  const [dayEdit, setDayEdit] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days = q.data?.days ?? [];
  const total = days.reduce((n, d) => n + d.items.length, 0);

  async function remove(i: AdminProgrammeItem) {
    if (!window.confirm(`Delete "${i.title}" from the programme? Its poster and artist photos are deleted too.`)) return;
    setError(null);
    try {
      await api.del(`/events/${ev.eventId}/programme/items/${i.id}`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy(from: string, to: string) {
    setError(null);
    setNotice(null);
    try {
      const r = await api.post<{ copied: number }>(`/events/${ev.eventId}/programme/days/${from}/copy-to/${to}`, {});
      setNotice(`Copied ${r.copied} item${r.copied === 1 ? '' : 's'} to ${fmtDate(to)} as drafts — check the times and publish them.`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        Plan what happens on each day — who is performing, pujas, competitions, chief guests. Published items appear on the public
        festival page under <strong>Programme &amp; line-up</strong>; mark the big names as <strong>Headline</strong> to show them in the
        star line-up at the top. Tag each item <strong>Indoor</strong> or <strong>Outdoor</strong> so visitors can filter.
      </Alert>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.data && total > 0 && ev.eventId && (
        <a href={`/f/${ev.slug ?? ev.eventId}#programme`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-end text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
          <ExternalLink aria-hidden className="h-4 w-4" /> See it on the public page
        </a>
      )}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : (
        days.map((d, n) => (
          <DayCard
            key={d.date}
            day={d}
            index={n}
            days={days}
            editable={editable}
            onAdd={() => setEditing({ item: null, date: d.date })}
            onEdit={(item) => setEditing({ item, date: d.date })}
            onRemove={remove}
            onEditDay={() => setDayEdit(d)}
            onCopy={(to) => copy(d.date, to)}
          />
        ))
      )}
      {editing && (
        <ItemForm
          item={editing.item}
          date={editing.date}
          days={days.filter((d) => d.inRange).map((d) => d.date)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            q.reload();
          }}
        />
      )}
      {dayEdit && (
        <DayForm
          day={dayEdit}
          onClose={() => setDayEdit(null)}
          onSaved={() => {
            setDayEdit(null);
            q.reload();
          }}
        />
      )}
    </div>
  );
}

function DayCard({
  day, index, days, editable, onAdd, onEdit, onRemove, onEditDay, onCopy,
}: {
  day: Day; index: number; days: Day[]; editable: boolean;
  onAdd: () => void; onEdit: (i: AdminProgrammeItem) => void; onRemove: (i: AdminProgrammeItem) => void; onEditDay: () => void; onCopy: (to: string) => void;
}) {
  const [copyTo, setCopyTo] = useState('');
  const targets = days.filter((d) => d.inRange && d.date !== day.date);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {day.inRange ? `Day ${index + 1}` : 'Outside the festival dates'} · {fmtDate(day.date)}
          </p>
          <h3 className="text-lg font-extrabold">{day.title || <span className="font-semibold text-slate-400">No day title</span>}</h3>
          {day.subtitle && <p className="text-sm text-slate-600">{day.subtitle}</p>}
          {!day.inRange && <p className="text-sm text-amber-800">The festival dates changed — move these items to a festival day or delete them. They are not shown publicly.</p>}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {day.inRange && (
              <Button variant="ghost" size="sm" onClick={onEditDay}>
                <Pencil aria-hidden className="h-4 w-4" /> Day title
              </Button>
            )}
            {day.inRange && (
              <Button size="sm" onClick={onAdd}>
                <Plus aria-hidden className="h-4 w-4" /> Add to programme
              </Button>
            )}
          </div>
        )}
      </div>

      {day.items.length === 0 ? (
        <Empty title="Nothing planned yet" icon={CalendarDays}>Add a performance, puja, competition or guest visit for this day.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {day.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-1 gap-3">
                <Poster path={i.posterUrl} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">{i.startTime}{i.endTime ? `–${i.endTime}` : ''}</span>
                    <span className={cx('rounded-full px-2 py-0.5', CATEGORY_STYLE[i.category])}>{CATEGORY_LABEL[i.category] ?? i.category}</span>
                    {i.setting && <span className={cx('rounded-full px-2 py-0.5', i.setting === 'OUTDOOR' ? 'bg-lime-100 text-lime-900' : 'bg-violet-100 text-violet-900')}>{i.setting === 'OUTDOOR' ? 'Outdoor' : 'Indoor'}</span>}
                    {i.isHeadline && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-amber-950"><Sparkles aria-hidden className="h-3 w-3" /> Headline</span>}
                    {!i.isPublished && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-slate-700"><EyeOff aria-hidden className="h-3 w-3" /> Draft</span>}
                    {i.status === 'CANCELLED' && <Badge className="bg-red-100 text-red-800">Cancelled</Badge>}
                  </div>
                  <p className="mt-1 font-bold">{i.title}</p>
                  {i.guests.length > 0 && <p className="text-sm text-slate-600">{i.guests.map((g) => g.name).join(', ')}</p>}
                  {(i.stage || i.language || i.ageLimit) && (
                    <p className="text-xs text-slate-500">{[i.stage, i.language, i.ageLimit].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
              </div>
              {editable && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onEdit(i)}>
                    <Pencil aria-hidden className="h-4 w-4" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => onRemove(i)} aria-label={`Delete ${i.title}`}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && day.inRange && day.items.length > 0 && targets.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <div className="min-w-[200px] flex-1">
            <LabeledSelect label="Copy this day's programme to" value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
              <option value="">Choose a day…</option>
              {targets.map((d) => (
                <option key={d.date} value={d.date}>{fmtDate(d.date)}{d.title ? ` · ${d.title}` : ''}</option>
              ))}
            </LabeledSelect>
          </div>
          <Button variant="secondary" disabled={!copyTo} onClick={() => { onCopy(copyTo); setCopyTo(''); }}>
            <Copy aria-hidden className="h-4 w-4" /> Copy as drafts
          </Button>
        </div>
      )}
    </Card>
  );
}

function Poster({ path }: { path: string | null }) {
  const src = useAuthedImage(path);
  if (!path) return null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-slate-100" />
  );
}

function DayForm({ day, onClose, onSaved }: { day: Day; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const [title, setTitle] = useState(day.title ?? '');
  const [subtitle, setSubtitle] = useState(day.subtitle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/events/${ev.eventId}/programme/days/${day.date}`, { title, subtitle });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Day title · ${fmtDate(day.date)}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Maha Ashtami" />
        <LabeledInput label="Line under it (optional)" value={subtitle} maxLength={160} onChange={(e) => setSubtitle(e.target.value)} placeholder="Colour of the day: Green · Sandhi Puja 11:42 pm" />
        <p className="text-xs text-slate-500">Leave both empty to remove the day title.</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

interface GuestRow {
  key: string;
  id?: string;
  name: string;
  role: string;
  bio: string;
  instagramUrl: string;
  photoUrl: string | null;
  newPhoto: File | null;
  removePhoto: boolean;
}

let rowSeq = 0;
const newRow = (): GuestRow => ({ key: `n${++rowSeq}`, name: '', role: '', bio: '', instagramUrl: '', photoUrl: null, newPhoto: null, removePhoto: false });

function ItemForm({ item, date: initialDate, days, onClose, onSaved }: { item: AdminProgrammeItem | null; date: string; days: string[]; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const [date, setDate] = useState(item?.date ?? initialDate);
  const [startTime, setStart] = useState(item?.startTime ?? '');
  const [endTime, setEnd] = useState(item?.endTime ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [category, setCategory] = useState<ProgrammeCategory>(item?.category ?? 'PERFORMANCE');
  const [setting, setSetting] = useState<ProgrammeSetting | ''>(item?.setting ?? '');
  const [stage, setStage] = useState(item?.stage ?? '');
  const [language, setLanguage] = useState(item?.language ?? '');
  const [ageLimit, setAge] = useState(item?.ageLimit ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [videoUrl, setVideo] = useState(item?.videoUrl ?? '');
  const [isHeadline, setHeadline] = useState(item?.isHeadline ?? false);
  const [isPublished, setPublished] = useState(item?.isPublished ?? true);
  const [cancelled, setCancelled] = useState(item?.status === 'CANCELLED');
  const [statusNote, setStatusNote] = useState(item?.statusNote ?? '');
  const [guests, setGuests] = useState<GuestRow[]>(
    item?.guests.map((g) => ({ key: g.id, id: g.id, name: g.name, role: g.role ?? '', bio: g.bio ?? '', instagramUrl: g.instagramUrl ?? '', photoUrl: g.photoUrl, newPhoto: null, removePhoto: false })) ?? [],
  );
  const [poster, setPoster] = useState<File | null>(null);
  const [removePoster, setRemovePoster] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const currentPoster = useAuthedImage(item?.posterUrl && !removePoster ? item.posterUrl : null);
  const posterPreview = useObjectUrl(poster) ?? currentPoster;

  const patchGuest = (key: string, p: Partial<GuestRow>) => setGuests((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));

  function pickImage(f: File | undefined, set: (f: File) => void) {
    if (!f) return;
    if (!IMAGE_TYPES.test(f.type)) return setError('Choose a PNG, JPG or WebP image.');
    setError(null);
    set(f);
  }

  async function upload(path: string, file: File, o: { max: number; maxBytes: number }) {
    const { blob } = await resizeImage(file, { ...o, quality: 0.85 });
    const form = new FormData();
    form.append('file', blob, `image.${blob.type.split('/')[1]}`);
    return uploadForm<AdminProgrammeItem>(path, form, { method: 'PUT' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 2) return setError('Enter a title, e.g. "Navratri Utsav with Falguni Pathak".');
    if (!HHMM.test(startTime)) return setError('Enter a start time.');
    if (endTime && !HHMM.test(endTime)) return setError('End time must be HH:mm.');
    if (endTime && endTime === startTime) return setError('Start and end time cannot be the same.');
    const named = guests.filter((g) => g.name.trim());
    const body = {
      date, startTime, endTime: endTime || null, title: title.trim(), category, setting: setting || null,
      stage, language, ageLimit, description, videoUrl, isHeadline, isPublished,
      status: cancelled ? 'CANCELLED' : 'SCHEDULED', statusNote: cancelled ? statusNote : '',
      guests: named.map((g) => ({ ...(g.id ? { id: g.id } : {}), name: g.name.trim(), role: g.role, bio: g.bio, instagramUrl: g.instagramUrl })),
    };
    let saving = true;
    try {
      setBusy('Saving…');
      const saved = item
        ? await api.patch<AdminProgrammeItem>(`/events/${ev.eventId}/programme/items/${item.id}`, body)
        : await api.post<AdminProgrammeItem>(`/events/${ev.eventId}/programme/items`, body);
      saving = false;
      const base = `/events/${ev.eventId}/programme/items/${saved.id}`;
      if (poster) {
        setBusy('Uploading poster…');
        await upload(`${base}/poster`, poster, { max: 1600, maxBytes: 1.9 * 1024 * 1024 });
      } else if (removePoster && item?.posterUrl) {
        await api.del(`${base}/poster`);
      }
      // The server returns guests in the order sent, so rows line up by index.
      for (let n = 0; n < named.length; n++) {
        const row = named[n];
        const g = saved.guests[n];
        if (!g) continue;
        if (row.newPhoto) {
          setBusy(`Uploading ${row.name.trim()}'s photo…`);
          await upload(`${base}/guests/${g.id}/photo`, row.newPhoto, { max: 600, maxBytes: 450 * 1024 });
        } else if (row.removePhoto && g.photoUrl) {
          await api.del(`${base}/guests/${g.id}/photo`);
        }
      }
      onSaved();
    } catch (err) {
      // Images upload after the item is saved: say so, so nobody re-adds it as a duplicate.
      setError(saving ? errorMessage(err) : `${errorMessage(err)} The programme item itself was saved — close this and edit it to retry the image.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? 'Edit programme item' : 'Add to programme'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Navratri Utsav with Falguni Pathak" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabeledSelect label="Day" value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d, n) => (
              <option key={d} value={d}>Day {n + 1} · {fmtDate(d)}</option>
            ))}
          </LabeledSelect>
          <LabeledInput label="Starts" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
          <LabeledInput label="Ends (optional)" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect label="Type" value={category} onChange={(e) => setCategory(e.target.value as ProgrammeCategory)}>
            {PROGRAMME_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </LabeledSelect>
          <Field label="Indoor / outdoor">
            <div className="flex gap-2" role="radiogroup" aria-label="Indoor or outdoor">
              {([['', 'Not set'], ['INDOOR', 'Indoor'], ['OUTDOOR', 'Outdoor']] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={setting === v}
                  onClick={() => setSetting(v)}
                  className={cx('min-h-[44px] flex-1 rounded-xl border-2 px-2 text-sm font-semibold', setting === v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600')}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabeledInput label="Stage / area" value={stage} maxLength={80} onChange={(e) => setStage(e.target.value)} placeholder="Main pandal stage" />
          <LabeledInput label="Language" value={language} maxLength={80} onChange={(e) => setLanguage(e.target.value)} placeholder="Hindi, Gujarati" />
          <LabeledInput label="Age limit" value={ageLimit} maxLength={30} onChange={(e) => setAge(e.target.value)} placeholder="All ages" />
        </div>
        <Field label="About this programme (optional)">
          <Textarea rows={4} value={description} maxLength={3000} onChange={(e) => setDescription(e.target.value)} placeholder="Garba and dandiya night with live band. Traditional dress encouraged." />
        </Field>
        <LabeledInput
          label="Video (optional)"
          value={videoUrl}
          maxLength={300}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://www.instagram.com/reel/… or a YouTube link"
          hint="An Instagram reel/post or a YouTube video/short — visitors can play it on the festival page."
        />

        <Field label="Poster (optional)" hint="Shown at the top of the item. Portrait or landscape, up to 2 MB after resizing.">
          <div className="flex flex-wrap items-center gap-3">
            {posterPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterPreview} alt="" className="h-24 w-24 rounded-lg object-cover" />
            )}
            <input ref={posterInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], (f) => { setPoster(f); setRemovePoster(false); })} />
            <Button type="button" variant="secondary" size="sm" onClick={() => posterInput.current?.click()}>
              <ImagePlus aria-hidden className="h-4 w-4" /> {posterPreview ? 'Change poster' : 'Add poster'}
            </Button>
            {posterPreview && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setPoster(null); setRemovePoster(true); }}>
                <X aria-hidden className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-bold">Artists / guests</legend>
          {guests.length === 0 && <p className="text-sm text-slate-500">Add the singers, performers, chief guests or groups appearing in this item.</p>}
          {guests.map((g) => (
            <GuestEditor
              key={g.key}
              row={g}
              onChange={(p) => patchGuest(g.key, p)}
              onRemove={() => setGuests((gs) => gs.filter((x) => x.key !== g.key))}
              onPick={(f) => pickImage(f, (file) => patchGuest(g.key, { newPhoto: file, removePhoto: false }))}
            />
          ))}
          {guests.length < 10 && (
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setGuests((gs) => [...gs, newRow()])}>
              <UserPlus aria-hidden className="h-4 w-4" /> Add artist / guest
            </Button>
          )}
        </fieldset>

        <div className="flex flex-col">
          <Checkbox label={<span><strong>Headline</strong> — feature in the star line-up at the top</span>} checked={isHeadline} onChange={setHeadline} />
          <Checkbox label="Published — show on the public festival page" checked={isPublished} onChange={setPublished} />
          <Checkbox label="Cancelled — keep it listed, marked cancelled" checked={cancelled} onChange={setCancelled} />
        </div>
        {cancelled && (
          <LabeledInput label="Note for visitors" value={statusNote} maxLength={300} onChange={(e) => setStatusNote(e.target.value)} placeholder="Cancelled due to rain — moved to Day 7, 8 pm" />
        )}

        {error && <Alert>{error}</Alert>}
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="text-sm text-slate-500">{busy}</span>}
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!!busy}>{item ? 'Save changes' : 'Add to programme'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function GuestEditor({ row, onChange, onRemove, onPick }: { row: GuestRow; onChange: (p: Partial<GuestRow>) => void; onRemove: () => void; onPick: (f: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const current = useAuthedImage(row.photoUrl && !row.removePhoto ? row.photoUrl : null);
  const preview = useObjectUrl(row.newPhoto) ?? current;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400"
          aria-label={preview ? 'Change photo' : 'Add photo'}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus aria-hidden className="h-6 w-6" />
          )}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <LabeledInput label="Name" value={row.name} maxLength={100} onChange={(e) => onChange({ name: e.target.value })} placeholder="Falguni Pathak" />
          <LabeledInput label="Role" value={row.role} maxLength={80} onChange={(e) => onChange({ role: e.target.value })} placeholder="Singer · Chief guest · Dhaki group" />
        </div>
        <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={onRemove} aria-label={`Remove ${row.name || 'guest'}`}>
          <Trash2 aria-hidden className="h-4 w-4" />
        </Button>
      </div>
      <LabeledInput label="Instagram (optional)" value={row.instagramUrl} maxLength={200} onChange={(e) => onChange({ instagramUrl: e.target.value })} placeholder="@artistname" />
      <Field label="Short intro (optional)">
        <Textarea rows={2} value={row.bio} maxLength={600} onChange={(e) => onChange({ bio: e.target.value })} placeholder="Known as the Queen of Dandiya…" />
      </Field>
      {preview && (
        <button type="button" className="self-start text-xs font-semibold text-red-700" onClick={() => onChange({ newPhoto: null, removePhoto: true })}>
          Remove photo
        </button>
      )}
    </div>
  );
}

/** A temporary preview URL for a picked file, revoked when it changes. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
