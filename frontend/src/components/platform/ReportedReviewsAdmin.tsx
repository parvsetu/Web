'use client';

import { useState } from 'react';
import { Flag, RotateCcw, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuthedImage } from '@/lib/images';
import { fmtDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import type { ReportedReview } from '@/lib/review-types';
import { Stars } from '../reviews/Stars';
import { Alert, Badge, Button, Card, Empty, Field, Modal, Pager, SkeletonList, Textarea } from '../ui';

const REASON: Record<string, string> = { SPAM: 'Spam / ads', OFFENSIVE: 'Offensive', FAKE: 'Fake', PRIVACY: 'Private details', OTHER: 'Other' };

/**
 * Super admin: visitor reviews that the public reported, across every mandal.
 * Three open reports hide a review automatically; here it is either restored
 * (reports dismissed) or removed for good. Mandals moderate their own reviews.
 */
export function ReportedReviewsAdmin() {
  const [page, setPage] = useState(1);
  const q = useAsync(() => api.get<Paged<ReportedReview>>('/platform/reviews/reported', { page, pageSize: 20 }), [page]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Reviews visitors reported. A review with 3 open reports is hidden automatically until someone checks it. Restore dismisses the reports (and puts an
        auto-hidden review back); Remove deletes the review and its photos.
      </p>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={3} />
      ) : !q.data?.items.length ? (
        <Empty title="No reported reviews" icon={Flag}>Nothing to check right now.</Empty>
      ) : (
        q.data.items.map((r) => <Reported key={r.id} r={r} onDone={q.reload} />)
      )}
      {q.data && <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

function Reported({ r, onDone }: { r: ReportedReview; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRemoving(false);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{r.organization.name} · {r.event.name}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><Stars value={r.rating} /> {r.displayName} · {fmtDateTime(r.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge value={r.status === 'APPROVED' ? 'ACTIVE' : r.status === 'PENDING' ? 'PENDING' : 'CANCELLED'}>{r.status.toLowerCase()}</Badge>
          {r.autoHidden && <Badge value="PAUSED">auto-hidden</Badge>}
          <Badge value="CANCELLED">{r.reportCount} report{r.reportCount === 1 ? '' : 's'}</Badge>
        </div>
      </div>
      {r.text ? <p className="whitespace-pre-line text-slate-800">{r.text}</p> : <p className="text-sm italic text-slate-400">No text.</p>}
      {r.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">{r.photos.map((p) => <Thumb key={p.id} path={p.thumbUrl} />)}</div>
      )}
      {r.reports.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-red-50 p-2 text-sm">
          {r.reports.map((x, i) => (
            <li key={i}><span className="font-semibold text-red-800">{REASON[x.reason] ?? x.reason}</span>{x.note ? ` — ${x.note}` : ''} <span className="text-xs text-slate-500">· {fmtDateTime(x.createdAt)}</span></li>
          ))}
        </ul>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy && !removing} onClick={() => void act(() => api.post(`/platform/reviews/${r.id}/restore`))}>
          <RotateCcw aria-hidden className="h-4 w-4" /> Restore
        </Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setRemoving(true)}><Trash2 aria-hidden className="h-4 w-4" /> Remove</Button>
      </div>
      {removing && (
        <Modal open onClose={() => setRemoving(false)} title="Remove review">
          <div className="flex flex-col gap-3">
            <Field label="Reason" hint="Kept in the mandal’s audit log.">
              <Textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => void act(() => api.post(`/platform/reviews/${r.id}/remove`, { reason: reason.trim() }))}>
              <Trash2 aria-hidden className="h-4 w-4" /> Remove for good
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Thumb({ path }: { path: string }) {
  const src = useAuthedImage(path);
  return (
    <span className="block h-20 w-20 overflow-hidden rounded-xl bg-orange-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="Visitor photo" className="h-full w-full object-cover" />}
    </span>
  );
}
