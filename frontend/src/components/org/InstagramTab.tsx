'use client';

import { useEffect, useState } from 'react';
import { Check, EyeOff, ExternalLink, Instagram, Link2Off, RefreshCw, RotateCcw, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { formatMb, useAuthedImage } from '@/lib/images';
import { useOrg } from '@/lib/org-context';
import { usePagedList } from '@/lib/paged';
import { can } from '@/lib/permissions';
import { Alert, Badge, Button, Card, Checkbox, Empty, Modal, Pager, SectionTitle, SkeletonList, cx } from '../ui';

interface IgStatus {
  configured: boolean;
  simulated: boolean;
  connection: { username: string; profileUrl: string; accountType: string | null; status: 'ACTIVE' | 'EXPIRED'; connectedAt: string; tokenExpiresAt: string | null; lastSyncAt: string | null; lastSyncError: string | null } | null;
  counts: { pending: number; approved: number; rejected: number };
  usage: { usedBytes: number; quotaBytes: number };
}
interface IgMedia { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; caption: string | null; permalink: string | null; postedAt: string | null; imageUrl: string; sizeBytes: number }

const VIEWS = [
  { key: 'PENDING', label: 'Waiting for you' },
  { key: 'APPROVED', label: 'On the page' },
  { key: 'REJECTED', label: 'Not shown' },
] as const;

/**
 * Mandal → Instagram: connect the mandal's own Instagram (Business / Creator),
 * then choose which of its photos appear on the landing page. Nothing shows
 * until it's approved here; approved photos are copied into the mandal's photo
 * storage (they count toward the 300 MB space).
 */
export function InstagramTab() {
  const { orgId, perms } = useOrg();
  const manage = can(perms, 'SETTINGS_UPDATE');
  const st = useAsync(() => api.get<IgStatus>(`/organizations/${orgId}/instagram`), [orgId]);
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('PENDING');
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const s = st.data;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('ig') === 'connected') {
      setFlash(`Instagram connected. ${q.get('added') ?? 0} photo(s) are waiting for you below — nothing appears on your page until you approve it.`);
      try {
        window.history.replaceState(null, '', `${window.location.pathname}#instagram`);
      } catch {
        /* ignore */
      }
    }
  }, []);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (ok) setFlash(ok);
      st.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const connect = () => run(async () => {
    const r = await api.post<{ url: string }>(`/organizations/${orgId}/instagram/connect`, {});
    window.location.href = r.url;
  });

  if (st.error) return <Alert>{st.error}</Alert>;
  if (!s) return <SkeletonList rows={2} />;
  return (
    <div className="flex flex-col gap-4">
      {flash && <Alert kind="success">{flash}</Alert>}
      {error && <Alert>{error}</Alert>}
      {!s.configured ? (
        <Card className="flex flex-col gap-2">
          <SectionTitle icon={Instagram}>Instagram photos</SectionTitle>
          <p className="text-sm text-slate-600">Show photos from your mandal’s Instagram on your landing page. This isn’t switched on yet — the Parvsetu team is setting up the Instagram connection.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <SectionTitle icon={Instagram}>Instagram photos</SectionTitle>
          {s.simulated && <Alert kind="warning">Test mode: Instagram is simulated and the photos are sample images.</Alert>}
          {s.connection ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <a href={s.connection.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-pink-700 underline">@{s.connection.username} <ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>
                <Badge className={s.connection.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{s.connection.status === 'ACTIVE' ? 'Connected' : 'Connection expired'}</Badge>
              </div>
              <p className="text-sm text-slate-600">
                Connected {fmtDate(s.connection.connectedAt.slice(0, 10))} · {s.connection.lastSyncAt ? `checked for new posts ${fmtDateTime(s.connection.lastSyncAt)}` : 'not checked yet'} · we check again every few hours and email you when there are new photos.
              </p>
              {s.connection.lastSyncError && <Alert kind="warning">Last check failed: {s.connection.lastSyncError}</Alert>}
              {s.connection.status === 'EXPIRED' && <Alert kind="warning">Instagram access has expired. Connect again to keep getting new photos — the photos already on your page stay.</Alert>}
              {manage && (
                <div className="flex flex-wrap gap-2">
                  {s.connection.status === 'ACTIVE'
                    ? <Button variant="secondary" loading={busy} onClick={() => void run(async () => { const r = await api.post<{ added: number }>(`/organizations/${orgId}/instagram/sync`, {}); setFlash(r.added ? `${r.added} new photo(s) found.` : 'No new photos.'); })}><RefreshCw aria-hidden className="h-4 w-4" /> Check for new photos</Button>
                    : <Button loading={busy} onClick={() => void connect()}><Instagram aria-hidden className="h-4 w-4" /> Connect again</Button>}
                  <Button variant="secondary" onClick={() => setDisconnecting(true)}><Link2Off aria-hidden className="h-4 w-4" /> Disconnect</Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">Connect your mandal’s Instagram and choose which photos appear on your landing page. You’ll log in on Instagram itself — Parvsetu never sees your password and can’t post anything.</p>
              <ul className="list-disc pl-5 text-sm text-slate-600">
                <li>The account must be a <strong>Business or Creator</strong> account (free to switch in the Instagram app: Settings → Account type).</li>
                <li>Only your own account can be connected, and only photos you approve are shown. Videos are skipped.</li>
              </ul>
              {manage ? <Button loading={busy} onClick={() => void connect()}><Instagram aria-hidden className="h-4 w-4" /> Connect Instagram</Button> : <p className="text-sm text-slate-500">Ask a mandal admin to connect Instagram.</p>}
            </>
          )}
          <p className="text-xs text-slate-500">Photo space used: {formatMb(s.usage.usedBytes)} of {formatMb(s.usage.quotaBytes)}. Turn the “From our Instagram” section on or off under Landing page → Layout.</p>
        </Card>
      )}

      {(s.counts.pending + s.counts.approved + s.counts.rejected > 0) && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
                className={cx('inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1', view === v.key ? 'bg-pink-600 text-white ring-pink-600' : 'bg-white text-slate-700 ring-slate-200')}>
                {v.label} <span className="tabular-nums opacity-80">{s.counts[v.key.toLowerCase() as 'pending' | 'approved' | 'rejected']}</span>
              </button>
            ))}
          </div>
          <MediaGrid key={`${view}-${s.counts.pending}-${s.counts.approved}-${s.counts.rejected}`} orgId={orgId} status={view} manage={manage} canApprove={s.connection?.status === 'ACTIVE'}
            onDone={(msg) => { setFlash(msg); st.reload(); }} onError={setError} />
        </>
      )}
      {disconnecting && <DisconnectModal orgId={orgId} onClose={() => setDisconnecting(false)} onDone={() => { setDisconnecting(false); setFlash('Instagram disconnected.'); st.reload(); }} />}
    </div>
  );
}

function MediaGrid({ orgId, status, manage, canApprove, onDone, onError }: { orgId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; manage: boolean; canApprove: boolean; onDone: (m: string) => void; onError: (m: string) => void }) {
  const q = usePagedList<IgMedia>(`/organizations/${orgId}/instagram/media`, { status }, { pageSize: 24 });
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function act(kind: 'approve' | 'reject' | 'restore', ids: string[]) {
    setBusy(true);
    try {
      if (kind === 'approve') {
        const r = await api.post<{ results: { id: string; ok: boolean; error?: string }[] }>(`/organizations/${orgId}/instagram/media/approve`, { ids });
        const failed = r.results.filter((x) => !x.ok);
        onDone(`${r.results.length - failed.length} photo(s) added to your page.${failed.length ? ` ${failed.length} couldn’t be added: ${[...new Set(failed.map((f) => f.error))].join(' ')}` : ''}`);
      } else {
        await api.post(`/organizations/${orgId}/instagram/media/${kind}`, { ids });
        onDone(kind === 'restore' ? 'Moved back to “Waiting for you”.' : status === 'APPROVED' ? 'Removed from your page.' : 'Won’t be shown.');
      }
      setPicked([]);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.loading && !q.data) return <SkeletonList rows={2} />;
  if (!q.items.length) return <Empty icon={Instagram} title={status === 'PENDING' ? 'Nothing waiting — you’re up to date' : status === 'APPROVED' ? 'No Instagram photos on your page yet' : 'Nothing here'} />;
  return (
    <div className="flex flex-col gap-3">
      {manage && (
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox label={`Select all on this page (${q.items.length})`} checked={picked.length === q.items.length} onChange={(v) => setPicked(v ? q.items.map((m) => m.id) : [])} />
          {picked.length > 0 && status === 'PENDING' && (
            <>
              <Button size="sm" variant="success" loading={busy} disabled={!canApprove} onClick={() => void act('approve', picked)}><Check aria-hidden className="h-4 w-4" /> Show {picked.length} on page</Button>
              <Button size="sm" variant="secondary" loading={busy} onClick={() => void act('reject', picked)}><X aria-hidden className="h-4 w-4" /> Don’t show</Button>
            </>
          )}
          {picked.length > 0 && status === 'APPROVED' && <Button size="sm" variant="secondary" loading={busy} onClick={() => void act('reject', picked)}><EyeOff aria-hidden className="h-4 w-4" /> Remove from page</Button>}
          {picked.length > 0 && status === 'REJECTED' && <Button size="sm" variant="secondary" loading={busy} onClick={() => void act('restore', picked)}><RotateCcw aria-hidden className="h-4 w-4" /> Review again</Button>}
        </div>
      )}
      {status === 'PENDING' && !canApprove && <Alert kind="warning">Connect Instagram again to add these photos.</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {q.items.map((m) => <Tile key={m.id} m={m} picked={picked.includes(m.id)} onPick={manage ? () => toggle(m.id) : undefined} />)}
      </div>
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
    </div>
  );
}

function Tile({ m, picked, onPick }: { m: IgMedia; picked: boolean; onPick?: () => void }) {
  // Rejected photos have no stored copy and aren't fetched again.
  const src = useAuthedImage(m.status === 'REJECTED' ? null : m.imageUrl);
  return (
    <div className={cx('flex flex-col overflow-hidden rounded-xl border bg-white', picked ? 'border-pink-500 ring-2 ring-pink-300' : 'border-slate-200')}>
      <button type="button" onClick={onPick} disabled={!onPick} aria-pressed={picked} className="relative aspect-square bg-slate-100 text-left">
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={m.caption?.slice(0, 120) ?? 'Instagram photo'} className="h-full w-full object-cover" />
          : <span className="flex h-full items-center justify-center text-xs text-slate-400">{m.status === 'REJECTED' ? 'Not shown' : 'Loading…'}</span>}
        {onPick && <span className={cx('absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow', picked ? 'bg-pink-600 text-white' : 'bg-black/30')}>{picked && <Check aria-hidden className="h-4 w-4" />}</span>}
      </button>
      <div className="flex flex-col gap-1 p-2 text-xs">
        {m.caption && <p className="line-clamp-2 text-slate-700">{m.caption}</p>}
        <p className="flex items-center justify-between gap-2 text-slate-500">
          <span>{m.postedAt ? fmtDate(m.postedAt.slice(0, 10)) : ''}</span>
          {m.permalink && <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">Post <ExternalLink aria-hidden className="h-3 w-3" /></a>}
        </p>
      </div>
    </div>
  );
}

function DisconnectModal({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Disconnect Instagram">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-700">Parvsetu stops reading your Instagram. Photos waiting for review are dropped.</p>
        <Checkbox label="Also remove the Instagram photos already on our page" checked={remove} onChange={setRemove} />
        {error && <Alert>{error}</Alert>}
        <Button variant="danger" loading={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post(`/organizations/${orgId}/instagram/disconnect`, { removePhotos: remove });
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>Disconnect</Button>
      </div>
    </Modal>
  );
}
