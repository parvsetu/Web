'use client';

import { useState } from 'react';
import { Award, Check, EyeOff, Flag, MessageSquareQuote, ShieldAlert, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuthedImage } from '@/lib/images';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { ModReview, ModReviewPage, ReviewStatus } from '@/lib/review-types';
import { Alert, Badge, Button, Card, Empty, Field, Modal, Pager, Select, SkeletonList, Textarea } from '../ui';
import { Stars } from './Stars';

const FLAG_LABEL: Record<string, string> = {
  CONTAINS_LINK: 'Has a link',
  CONTAINS_PHONE: 'Has a phone number',
  CONTAINS_EMAIL: 'Has an email address',
  ABUSIVE_LANGUAGE: 'Possibly abusive words',
};
const flagLabel = (f: string) => FLAG_LABEL[f] ?? f.replace(/_/g, ' ').toLowerCase();

const STATUS_TABS: { key: ReviewStatus; label: string }[] = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Published' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'REJECTED', label: 'Rejected' },
];

/**
 * Visitor review moderation. `base` is `/organizations/<id>` (all festivals,
 * with a festival filter) or `/events/<id>` (one festival). Nothing a visitor
 * posts is public until approved here; photos are published one by one.
 */
export function ReviewModeration({ base, canManage, events }: { base: string; canManage: boolean; events?: { id: string; name: string }[] }) {
  const [status, setStatus] = useState<ReviewStatus>('PENDING');
  const [flagged, setFlagged] = useState(false);
  const [eventId, setEventId] = useState('');
  const [page, setPage] = useState(1);
  const q = useAsync(
    () => api.get<ModReviewPage>(`${base}/reviews`, { status, flagged: flagged || undefined, eventId: eventId || undefined, page, pageSize: 20 }),
    [base, status, flagged, eventId, page],
  );
  const c = q.data?.counts;
  const pick = (s: ReviewStatus) => {
    setStatus(s);
    setFlagged(false);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><MessageSquareQuote aria-hidden className="h-5 w-5" /></span>
          <p className="text-sm text-slate-600">
            Visitors with a paid pass can rate the festival and add up to 3 photos, from its first day until 30 days after it ends. Nothing is shown publicly until you
            approve it. Approved reviews appear on the festival page and your landing page; featured ones show first{c ? ` (${c.featured}/${c.maxFeatured} featured)` : ''}.
          </p>
        </div>
        <div role="tablist" className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              onClick={() => pick(t.key)}
              className={cx('inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-sm font-semibold', status === t.key ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-200 bg-white hover:bg-orange-50')}
            >
              {t.label}
              {c && <span className={cx('rounded-full px-1.5 text-xs', status === t.key ? 'bg-white/25' : 'bg-orange-100 text-orange-800')}>{c[t.key]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status === 'PENDING' && (
            <label className="flex min-h-[40px] items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); setPage(1); }} />
              <ShieldAlert aria-hidden className="h-4 w-4 text-amber-600" /> Only flagged{c ? ` (${c.flaggedPending})` : ''}
            </label>
          )}
          {events && events.length > 1 && (
            <Select aria-label="Festival" value={eventId} onChange={(e) => { setEventId(e.target.value); setPage(1); }} className="max-w-xs">
              <option value="">All festivals</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          )}
          {c && c.reported > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700"><Flag aria-hidden className="h-4 w-4" /> {c.reported} reported by visitors</span>
          )}
        </div>
      </Card>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={3} />
      ) : !q.data?.items.length ? (
        <Empty title={status === 'PENDING' ? 'Nothing waiting' : 'No reviews here'} icon={MessageSquareQuote}>
          {status === 'PENDING' ? 'New visitor reviews will appear here for approval.' : 'Reviews move here when you change their status.'}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {q.data.items.map((r) => <ReviewItem key={r.id} r={r} base={base} canManage={canManage} showEvent={!!events} onChanged={q.reload} />)}
        </div>
      )}
      {q.data && <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

type Dialog = null | 'approve' | 'reject' | 'hide' | 'delete';

function ReviewItem({ r, base, canManage, showEvent, onChanged }: { r: ModReview; base: string; canManage: boolean; showEvent: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const path = `${base}/reviews/${r.id}`;

  return (
    <Card className={cx('flex flex-col gap-3', r.flagged && r.status === 'PENDING' && 'border-amber-300')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={r.rating} />
            <span className="font-bold">{r.displayName}</span>
            {r.featured && <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white"><Award aria-hidden className="h-3 w-3" /> Featured</span>}
          </div>
          <p className="text-xs text-slate-500">
            {fmtDateTime(r.createdAt)}
            {showEvent ? ` · ${r.event.name}` : ''}
            {r.updatedAt !== r.createdAt && r.status === 'PENDING' ? ' · edited' : ''}
          </p>
        </div>
        <Badge value={r.status === 'APPROVED' ? 'ACTIVE' : r.status === 'PENDING' ? 'PENDING' : 'CANCELLED'}>{STATUS_TABS.find((t) => t.key === r.status)?.label}</Badge>
      </div>

      {r.flagReasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ShieldAlert aria-hidden className="h-4 w-4 text-amber-600" />
          {r.flagReasons.map((f) => <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{flagLabel(f)}</span>)}
        </div>
      )}
      {(r.reportCount > 0 || r.autoHidden) && (
        <Alert kind="warning">
          {r.reportCount > 0 ? `Reported by ${r.reportCount} visitor${r.reportCount === 1 ? '' : 's'}.` : ''}
          {r.autoHidden ? ' Hidden automatically until someone checks it — approve it again to put it back.' : ''}
        </Alert>
      )}

      {r.text ? <p className="whitespace-pre-line text-slate-800">{r.text}</p> : <p className="text-sm italic text-slate-400">No text — rating only.</p>}

      {r.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.photos.map((p) => (
            <ModPhoto
              key={p.id}
              path={p.thumbUrl}
              approved={p.approved}
              showState={r.status === 'APPROVED'}
              actions={canManage ? (
                <>
                  {r.status === 'APPROVED' && (
                    <button type="button" disabled={busy} onClick={() => void act(() => api.patch(`${path}/photos/${p.id}`, { approved: !p.approved }))} className="rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-white">
                      {p.approved ? 'Unpublish' : 'Publish'}
                    </button>
                  )}
                  <button type="button" disabled={busy} aria-label="Delete photo" onClick={() => confirm('Delete this photo? This can’t be undone.') && void act(() => api.del(`${path}/photos/${p.id}`))} className="rounded-lg bg-white/90 p-1 text-red-700 hover:bg-white">
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            />
          ))}
        </div>
      )}

      {r.moderatedAt && r.status !== 'PENDING' && (
        <p className="text-xs text-slate-500">
          {r.moderatedBy ? `${r.moderatedBy.name} · ` : ''}{fmtDate(r.moderatedAt.slice(0, 10))}
          {r.moderationNote ? ` — “${r.moderationNote}”` : ''}
        </p>
      )}
      {error && <Alert>{error}</Alert>}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {r.status !== 'APPROVED' && (
            <Button size="sm" variant="success" loading={busy && dialog === null} onClick={() => (r.photos.length ? setDialog('approve') : void act(() => api.post(`${path}/approve`, {})))}>
              <Check aria-hidden className="h-4 w-4" /> {r.status === 'HIDDEN' ? 'Publish again' : 'Approve'}
            </Button>
          )}
          {r.status === 'APPROVED' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => api.post(`${path}/feature`, { featured: !r.featured }))}>
              <Award aria-hidden className="h-4 w-4" /> {r.featured ? 'Un-feature' : 'Feature'}
            </Button>
          )}
          {r.status === 'APPROVED' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('hide')}>
              <EyeOff aria-hidden className="h-4 w-4" /> Hide
            </Button>
          )}
          {r.status !== 'REJECTED' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog('reject')}>
              <X aria-hidden className="h-4 w-4" /> Reject
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} className="text-red-700" onClick={() => setDialog('delete')}>
            <Trash2 aria-hidden className="h-4 w-4" /> Delete
          </Button>
        </div>
      )}

      {dialog === 'approve' && <ApproveDialog r={r} busy={busy} error={error} onClose={() => setDialog(null)} onApprove={(photoIds, note) => void act(() => api.post(`${path}/approve`, { photoIds, note: note || undefined }))} />}
      {(dialog === 'reject' || dialog === 'hide') && (
        <NoteDialog
          title={dialog === 'reject' ? 'Reject review' : 'Hide review'}
          hint={dialog === 'reject' ? 'The visitor sees this note on their pass page.' : 'Only your team sees this note. You can publish the review again later.'}
          action={dialog === 'reject' ? 'Reject' : 'Hide'}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={(note) => void act(() => api.post(`${path}/${dialog}`, { note: note || undefined }))}
        />
      )}
      {dialog === 'delete' && (
        <Modal open onClose={() => setDialog(null)} title="Delete review">
          <div className="flex flex-col gap-3">
            <p className="text-slate-700">The review and its photos are deleted for good (the action is kept in the audit log). The visitor can’t post another one for this booking.</p>
            {error && <Alert>{error}</Alert>}
            <Button variant="danger" loading={busy} onClick={() => void act(() => api.del(path))}><Trash2 aria-hidden className="h-4 w-4" /> Delete</Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function ModPhoto({ path, approved, showState, actions }: { path: string; approved: boolean; showState: boolean; actions: React.ReactNode }) {
  const src = useAuthedImage(path);
  return (
    <div className="relative h-28 w-28 overflow-hidden rounded-xl bg-orange-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="Visitor photo" className={cx('h-full w-full object-cover', showState && !approved && 'opacity-60')} /> : <span className="block h-full w-full animate-pulse bg-orange-100" />}
      {showState && (
        <span className={cx('absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', approved ? 'bg-green-600 text-white' : 'bg-slate-700 text-white')}>{approved ? 'Public' : 'Not public'}</span>
      )}
      {actions && <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">{actions}</div>}
    </div>
  );
}

function ApproveDialog({ r, busy, error, onClose, onApprove }: { r: ModReview; busy: boolean; error: string | null; onClose: () => void; onApprove: (photoIds: string[], note: string) => void }) {
  const [ids, setIds] = useState<string[]>(r.photos.map((p) => p.id));
  const [note, setNote] = useState('');
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <Modal open onClose={onClose} title="Approve review">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Choose which photos to publish with it. Check that people in them would be happy to be shown.</p>
        <div className="flex flex-wrap gap-2">
          {r.photos.map((p) => (
            <button key={p.id} type="button" aria-pressed={ids.includes(p.id)} onClick={() => toggle(p.id)} className={cx('rounded-xl ring-4', ids.includes(p.id) ? 'ring-green-500' : 'ring-transparent')}>
              <ModPhoto path={p.thumbUrl} approved={ids.includes(p.id)} showState actions={null} />
            </button>
          ))}
        </div>
        <Field label="Note for your team (optional)">
          <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button variant="success" loading={busy} onClick={() => onApprove(ids, note.trim())}>
          <Check aria-hidden className="h-4 w-4" /> Approve{r.photos.length ? ` with ${ids.length} of ${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}` : ''}
        </Button>
      </div>
    </Modal>
  );
}

function NoteDialog({ title, hint, action, busy, error, onClose, onConfirm }: {
  title: string; hint: string; action: string; busy: boolean; error: string | null; onClose: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <Field label="Note (optional)" hint={hint}>
          <Textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button variant="danger" loading={busy} onClick={() => onConfirm(note.trim())}>{action}</Button>
      </div>
    </Modal>
  );
}
