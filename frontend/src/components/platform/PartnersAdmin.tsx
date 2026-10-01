'use client';

import { useState } from 'react';
import { Ban, Check, CirclePlay, Coins, Handshake, Megaphone, OctagonX, Pause, ShieldCheck, Square, Wallet, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtMoney, humanize } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import type { AdminPartnerRow, PartnerCampaign } from '@/lib/partner-types';
import { SearchBar } from '../SearchBar';
import { CampaignCard, PartnerLogo } from '../partner/PartnerParts';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Textarea, cx } from '../ui';

const WALLET_STYLE = { OK: 'bg-green-100 text-green-800', LOW: 'bg-amber-100 text-amber-800', EXHAUSTED: 'bg-red-100 text-red-800' };

/**
 * Super admin: promotional partner accounts and the campaign request queue.
 * The platform alone approves brands and campaigns (mandals earn nothing from
 * partner money and are not asked). Campaigns can be approved only for an
 * ACTIVE partner, so approve the account first.
 */
export function PartnersAdmin() {
  const [view, setView] = useState<'campaigns' | 'partners'>('campaigns');
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-5 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Promotional partners</p>
        <p className="text-2xl font-black">Brands pay the platform per pass printed</p>
        <p className="text-sm text-white/90">100% of partner money is platform revenue. Mandals are not charged and are not asked to approve.</p>
      </section>
      <div className="flex gap-2" role="tablist">
        {([['campaigns', 'Campaign requests', Megaphone], ['partners', 'Partner accounts', Handshake]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
              view === k ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md' : 'bg-white text-slate-700 ring-1 ring-violet-200 hover:bg-violet-50',
            )}
          >
            <Icon aria-hidden className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {view === 'campaigns' ? <CampaignQueue /> : <PartnerAccounts />}
    </div>
  );
}

// ─── Campaign queue ───────────────────────────────────────────────────

function CampaignQueue() {
  const [status, setStatus] = useState('REQUESTED');
  const list = usePagedList<PartnerCampaign>('/platform/partner-campaigns', { status: status || undefined }, { pageSize: 10 });
  const [approving, setApproving] = useState<PartnerCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(c: PartnerCampaign, action: 'REJECT' | 'PAUSE' | 'RESUME' | 'END') {
    let note: string | undefined;
    if (action === 'REJECT' || action === 'END') {
      const n = window.prompt(action === 'REJECT' ? `Reject ${c.partner?.name}'s request at ${c.organization.name}? Tell the partner why:` : 'End this campaign? Optional note:', '');
      if (n === null) return;
      if (action === 'REJECT' && n.trim().length < 3) return setError('A note is required to reject a request.');
      note = n.trim() || undefined;
    }
    setError(null);
    try {
      await api.post(`/platform/partner-campaigns/${c.id}/review`, { action, note });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={list.search} onChange={list.setSearch} placeholder="Search partner, mandal or message" total={list.total}>
        <div className="sm:w-48">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['REQUESTED', 'APPROVED', 'PAUSED', 'ENDED', 'REJECTED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </LabeledSelect>
        </div>
      </SearchBar>
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty icon={Megaphone} title={status === 'REQUESTED' ? 'No requests waiting' : 'No campaigns match'} />
      ) : (
        list.items.map((c) => (
          <CampaignCard
            key={c.id}
            c={c}
            showPartner
            actions={
              <>
                {c.partner && c.partner.status !== 'ACTIVE' && c.status === 'REQUESTED' && (
                  <span className="mr-auto self-center text-xs font-semibold text-amber-700">Partner account is {c.partner.status.toLowerCase()}</span>
                )}
                {c.partner && <span className="self-center text-xs text-slate-500">Wallet {fmtMoney(c.partner.walletBalance)}</span>}
                {c.status === 'REQUESTED' && (
                  <>
                    <Button size="sm" variant="success" onClick={() => setApproving(c)}><Check aria-hidden className="h-4 w-4" /> Approve</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void review(c, 'REJECT')}><X aria-hidden className="h-4 w-4" /> Reject</Button>
                  </>
                )}
                {c.status === 'APPROVED' && <Button size="sm" variant="secondary" onClick={() => void review(c, 'PAUSE')}><Pause aria-hidden className="h-4 w-4" /> Pause</Button>}
                {c.status === 'PAUSED' && <Button size="sm" variant="secondary" onClick={() => void review(c, 'RESUME')}><CirclePlay aria-hidden className="h-4 w-4" /> Resume</Button>}
                {(c.status === 'APPROVED' || c.status === 'PAUSED') && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void review(c, 'END')}><Square aria-hidden className="h-4 w-4" /> End</Button>}
              </>
            }
          />
        ))
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      {approving && <ApproveModal c={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); list.reload(); }} />}
    </div>
  );
}

function ApproveModal({ c, onClose, onDone }: { c: PartnerCampaign; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState(c.rate);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const est = c.maxPasses ? Number(rate || 0) * c.maxPasses : null;

  async function approve() {
    setError(null);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(rate)) return setError('Enter a rate like 0.50');
    setBusy(true);
    try {
      await api.post(`/platform/partner-campaigns/${c.id}/review`, { action: 'APPROVE', ...(rate !== c.rate ? { rate } : {}), note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Approve campaign">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          <strong>{c.partner?.name}</strong> on passes of <strong>{c.organization.name}</strong> ({c.event?.name ?? 'all festivals'}), {c.startDate} to {c.endDate}
          {c.maxPasses ? `, up to ${c.maxPasses.toLocaleString('en-IN')} passes` : ', no cap'}.
        </p>
        <LabeledInput label="Rate per pass (₹)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} hint={`Quoted ${fmtMoney(c.rate)} from the mandal's partner rate. Locked once approved.`} />
        {est !== null && <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">Maximum spend at this rate: <strong>{fmtMoney(est)}</strong></p>}
        <LabeledInput label="Note to the partner (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button variant="success" loading={busy} onClick={() => void approve()}>
          <Check aria-hidden className="h-4 w-4" /> Approve
        </Button>
      </div>
    </Modal>
  );
}

// ─── Partner accounts ─────────────────────────────────────────────────

function PartnerAccounts() {
  const [status, setStatus] = useState('');
  const list = usePagedList<AdminPartnerRow>('/platform/partners', { status: status || undefined }, { pageSize: 10 });
  const [acting, setActing] = useState<{ p: AdminPartnerRow; to: 'ACTIVE' | 'SUSPENDED' | 'REJECTED' } | null>(null);
  const [adjusting, setAdjusting] = useState<AdminPartnerRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={list.search} onChange={list.setSearch} placeholder="Search brand, contact, email or phone" total={list.total}>
        <div className="sm:w-48">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </LabeledSelect>
        </div>
      </SearchBar>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty icon={Handshake} title="No partners match" />
      ) : (
        list.items.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PartnerLogo p={p} className="h-14 w-14 shrink-0 rounded-xl ring-1 ring-violet-100" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{p.name}</span>
                  <Badge value={p.status} />
                  {p.login && !p.login.emailVerified && <Badge className="bg-amber-100 text-amber-800">email not verified</Badge>}
                </div>
                <div className="truncate text-sm text-slate-600">{[p.contactName, p.contactEmail, p.contactPhone].join(' · ')}</div>
                <div className="text-xs text-slate-500">
                  {[p.gstin && `GSTIN ${p.gstin}`, p.websiteUrl, `Joined ${fmtDateTime(p.createdAt)}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {Object.entries(p.campaigns).map(([s, n]) => (
                    <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{humanize(s)} {n}</span>
                  ))}
                </div>
                {p.reviewNote && <div className="text-xs text-slate-500">Note: {p.reviewNote}</div>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', WALLET_STYLE[p.wallet.state])}>
                <Wallet aria-hidden className="h-3.5 w-3.5" /> {fmtMoney(p.walletBalance)}
              </span>
              <span className="text-xs text-slate-500">spent {fmtMoney(p.totalSpent)}</span>
              {p.status !== 'ACTIVE' && <Button size="sm" variant="success" onClick={() => setActing({ p, to: 'ACTIVE' })}><ShieldCheck aria-hidden className="h-4 w-4" /> {p.status === 'PENDING' ? 'Approve' : 'Reactivate'}</Button>}
              {p.status === 'PENDING' && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setActing({ p, to: 'REJECTED' })}><OctagonX aria-hidden className="h-4 w-4" /> Reject</Button>}
              {p.status === 'ACTIVE' && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setActing({ p, to: 'SUSPENDED' })}><Ban aria-hidden className="h-4 w-4" /> Suspend</Button>}
              <Button size="sm" variant="secondary" onClick={() => setAdjusting(p)}><Coins aria-hidden className="h-4 w-4" /> Wallet</Button>
            </div>
          </Card>
        ))
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      {acting && <StatusModal {...acting} onClose={() => setActing(null)} onDone={() => { setActing(null); list.reload(); }} />}
      {adjusting && <AdjustModal p={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); list.reload(); }} />}
    </div>
  );
}

function StatusModal({ p, to, onClose, onDone }: { p: AdminPartnerRow; to: 'ACTIVE' | 'SUSPENDED' | 'REJECTED'; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verb = to === 'ACTIVE' ? (p.status === 'PENDING' ? 'Approve' : 'Reactivate') : to === 'SUSPENDED' ? 'Suspend' : 'Reject';
  async function go() {
    setError(null);
    if (to !== 'ACTIVE' && note.trim().length < 3) return setError('Add a note explaining why.');
    setBusy(true);
    try {
      await api.post(`/platform/partners/${p.id}/status`, { status: to, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${verb} ${p.name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          {to === 'ACTIVE'
            ? 'Their approved campaigns start printing (while the wallet covers them). Requested campaigns can then be approved.'
            : to === 'SUSPENDED'
              ? 'All their campaigns stop printing immediately. They keep read-only access to their history.'
              : 'Their open campaign requests are rejected with this note.'}
        </p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={to === 'ACTIVE' ? 'Optional note' : 'Reason (shown to the partner)'} maxLength={500} />
        {error && <Alert>{error}</Alert>}
        <Button variant={to === 'ACTIVE' ? 'success' : 'danger'} loading={busy} onClick={() => void go()}>{verb}</Button>
      </div>
    </Modal>
  );
}

function AdjustModal({ p, onClose, onDone }: { p: AdminPartnerRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/platform/partners/${p.id}/adjust`, { amount, reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${p.name} — wallet`}>
      <div className="flex flex-col gap-4">
        <SectionTitle icon={Wallet}>Balance {fmtMoney(p.walletBalance)}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Amount (₹, use − to deduct)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="e.g. 5000" />
          <LabeledInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="NEFT ref / correction" />
        </div>
        <p className="text-xs text-slate-500">Every adjustment is written to the partner&apos;s wallet history and the audit log. The wallet can never go below zero.</p>
        {error && <Alert>{error}</Alert>}
        <Button loading={busy} disabled={!/^-?\d{1,8}(\.\d{1,2})?$/.test(amount) || reason.trim().length < 3} onClick={() => void go()}>
          <Coins aria-hidden className="h-4 w-4" /> Apply
        </Button>
      </div>
    </Modal>
  );
}
