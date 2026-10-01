'use client';

import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CalendarDays, CreditCard, Hourglass, MapPin, Wallet } from 'lucide-react';
import { api, API_URL, errorMessage } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { PartnerCampaign, PartnerProfile, PartnerRecharge, PartnerWallet } from '@/lib/partner-types';
import { PRINTING_LABEL } from '@/lib/partner-types';
import { Alert, Badge, Button, LabeledInput, Modal, cx } from '../ui';

export const partnerLogoSrc = (p: { logoUrl: string | null }) => (p.logoUrl ? `${API_URL}${p.logoUrl}` : null);

export function PartnerLogo({ p, className }: { p: { name: string; logoUrl: string | null }; className?: string }) {
  const src = partnerLogoSrc(p);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${p.name} logo`} className={cx('bg-white object-contain', className)} />
  ) : (
    <span className={cx('flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-600 font-black text-white', className)}>{p.name.slice(0, 2).toUpperCase()}</span>
  );
}

/** Account-status banner: what a PENDING / SUSPENDED / REJECTED brand can and can't do. */
export function PartnerStatusBanner({ partner }: { partner: PartnerProfile }) {
  if (partner.status === 'ACTIVE') return null;
  if (partner.status === 'PENDING') {
    return (
      <Alert kind="info">
        <strong>Your partner account is awaiting approval by the Parvsetu team.</strong> Meanwhile you can complete your profile, upload your logo,
        recharge your wallet and request campaigns. Nothing is printed (or charged) until both your account and the campaign are approved.
      </Alert>
    );
  }
  return (
    <Alert kind="warning">
      <strong>{partner.status === 'SUSPENDED' ? 'Your partner account is suspended.' : 'Your partner application was not approved.'}</strong>{' '}
      {partner.reviewNote ? `Note from the platform: ${partner.reviewNote}. ` : ''}Your history stays visible, but campaigns don&apos;t print and changes are disabled.
    </Alert>
  );
}

/** Big wallet card with LOW / EXHAUSTED colouring. */
export function WalletHero({ balance, wallet, onRecharge, locked }: { balance: string; wallet: PartnerWallet; onRecharge?: () => void; locked?: boolean }) {
  return (
    <section
      className={cx(
        'relative overflow-hidden rounded-3xl p-5 text-white shadow-lg',
        wallet.state === 'EXHAUSTED' ? 'bg-gradient-to-br from-rose-500 to-red-700' : wallet.state === 'LOW' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-violet-600 to-fuchsia-600',
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
          {wallet.state === 'EXHAUSTED' ? <AlertOctagon aria-hidden className="h-9 w-9" /> : wallet.state === 'LOW' ? <AlertTriangle aria-hidden className="h-9 w-9" /> : <Wallet aria-hidden className="h-9 w-9" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Promotion wallet</p>
          <p className="text-4xl font-black">{fmtMoney(balance)}</p>
          <p className="text-sm text-white/90">
            {wallet.message ?? (wallet.passesLeft !== null ? `Enough for about ${wallet.passesLeft.toLocaleString('en-IN')} more passes at your highest rate` : 'Charged only per pass printed with your logo')}
          </p>
        </div>
        {onRecharge && !locked && (
          <button type="button" onClick={onRecharge} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-5 font-bold text-slate-900 shadow">
            <CreditCard aria-hidden className="h-5 w-5" /> Recharge
          </button>
        )}
      </div>
    </section>
  );
}

export function PrintingBadge({ c }: { c: Pick<PartnerCampaign, 'status' | 'printing'> }) {
  if (!c.printing) return <Badge value={c.status} />;
  const p = PRINTING_LABEL[c.printing];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge value={c.status} />
      <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', p.cls)}>{p.label}</span>
    </span>
  );
}

/** printed / cap as a small progress bar. */
export function CapBar({ printed, cap }: { printed: number; cap: number | null }) {
  const pct = cap ? Math.min(100, (printed / cap) * 100) : 0;
  return (
    <div className="min-w-[120px]">
      <div className="text-xs font-semibold tabular-nums text-slate-700">
        {printed.toLocaleString('en-IN')} {cap ? `/ ${cap.toLocaleString('en-IN')}` : 'printed'}
      </div>
      {cap !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** One campaign: mandal, festival, dates, message, numbers. `actions` slot for cancel / review buttons. */
export function CampaignCard({ c, actions, showPartner }: { c: PartnerCampaign; actions?: React.ReactNode; showPartner?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {showPartner && c.partner && <span className="font-extrabold text-violet-800">{c.partner.name}</span>}
          {showPartner && c.partner && <span className="text-slate-400">→</span>}
          <span className="font-bold">{c.organization.name}</span>
          <PrintingBadge c={c} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5 text-slate-400" />{[c.organization.city, c.organization.state].filter(Boolean).join(', ') || '—'}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-3.5 w-3.5 text-slate-400" />{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</span>
          <span className="inline-flex items-center gap-1"><Hourglass aria-hidden className="h-3.5 w-3.5 text-slate-400" />{c.event ? c.event.name : 'All festivals'}</span>
        </div>
        <p className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-sm italic text-violet-900">“{c.message}”</p>
        {c.reviewNote && <p className="mt-1 text-xs text-slate-500">Platform note: {c.reviewNote}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm lg:w-80 lg:shrink-0">
        <div>
          <div className="text-[11px] font-semibold uppercase text-slate-500">Rate / pass</div>
          <div className="font-bold tabular-nums">{fmtMoney(c.rate)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase text-slate-500">Printed</div>
          <CapBar printed={c.passesPrinted} cap={c.maxPasses} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase text-slate-500">Spent</div>
          <div className="font-bold tabular-nums text-fuchsia-700">{fmtMoney(c.spent)}</div>
          {c.estimate && <div className="text-[11px] text-slate-500">of up to {fmtMoney(c.estimate)}</div>}
        </div>
        {actions && <div className="col-span-3 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Demo checkout for the partner wallet (same flow as mandal credit recharge). */
export function PartnerRechargeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('2000');
  const [pending, setPending] = useState<PartnerRecharge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) < 1) return setError('Enter an amount of at least ₹1.');
    setBusy(true);
    try {
      setPending(await api.post<PartnerRecharge>('/partner/recharges', { amount }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay(outcome: 'success' | 'fail') {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<PartnerRecharge>(`/partner/recharges/${pending.id}/demo-pay`, { outcome });
      if (r.status === 'PAID') onDone();
      else {
        setError('Payment failed. Nothing was added — you can try again.');
        setPending(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Recharge promotion wallet">
      {!pending ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {['1000', '2000', '5000', '10000'].map((a) => (
              <button key={a} type="button" onClick={() => setAmount(a)} className={cx('min-h-[44px] rounded-full px-4 font-semibold', amount === a ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'bg-white ring-1 ring-violet-200')}>
                ₹{Number(a).toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <LabeledInput label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          {error && <Alert>{error}</Alert>}
          <Button size="lg" loading={busy} onClick={() => void start()}>
            <CreditCard aria-hidden className="h-5 w-5" /> Continue to payment
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo payment — no real money is charged.</div>
          <p className="text-center text-3xl font-black">{fmtMoney(pending.amount)}</p>
          {error && <Alert>{error}</Alert>}
          <Button variant="success" size="lg" loading={busy} onClick={() => void pay('success')}>
            Pay {fmtMoney(pending.amount)} (demo)
          </Button>
          <Button variant="ghost" onClick={() => void pay('fail')} disabled={busy}>
            Simulate failed payment
          </Button>
        </div>
      )}
    </Modal>
  );
}
