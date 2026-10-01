'use client';

import { useState } from 'react';
import { AlertOctagon, AlertTriangle, BadgeIndianRupee, Building2, Coins, Globe, Handshake, Percent, Save, Settings2, SlidersHorizontal, Ticket, Wallet } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import type { CreditStatus } from '../org/CreditTab';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Table, Td, cx } from '../ui';

interface Settings { defaultTokenPrice: string; defaultCommissionPercent: string; lowCreditThreshold: string; welcomeCredit: string; partnerRate: string; feePerPass: string; gatewayFeePercent: string; defaultPassPrintFormat: string; landingPageYearlyPrice: string }
interface Summary {
  commissionEarned: string; partnerFeesEarned: string; promotionalPartnerEarned: string; eventFeesEarned: string; eventFeesPaid: number; agentEarningsDue: string; agentPayoutsMade: string; partnerWalletsOutstanding: string; splitCommissionEarned: string; onlineGross: string; totalEarned: string; landingPageEarned: string; landingPagesSold: number; tokensGenerated: number; personsAdmitted: number;
  creditOutstanding: string; totalRecharged: string; paidRecharges: number;
  mandals: { total: number; low: number; exhausted: number };
  bySource: { source: string | null; commission: string; tokens: number }[];
}
interface MandalRow { id: string; name: string; city: string | null; state: string | null; billing: CreditStatus & { passPrintFormat: string; overrides: Record<string, boolean>; eventFee: string | null; landingPage: { price: string; paidUntil: string | null; active: boolean } } }
interface TxRow { id: string; createdAt: string; type: string; source: string | null; organization: { name: string }; event: { name: string } | null; amount: string; balanceAfter: string; tokenCount: number; personCount: number; reference: string | null; note: string | null }

const PRINT_SETTINGS = [
  { key: 'AUTO', label: 'Auto — A4 with 2+ ads, else thermal 80 mm' },
  { key: 'A4', label: 'A4 page (PDF-friendly)' },
  { key: 'THERMAL_80', label: 'Thermal 80 mm' },
  { key: 'THERMAL_58', label: 'Thermal 58 mm' },
];

const STATE_STYLE = { OK: 'bg-green-100 text-green-800', LOW: 'bg-amber-100 text-amber-800', EXHAUSTED: 'bg-red-100 text-red-800' };

/** Super admin: commission & pricing rules, earnings, mandal credit, all credit transactions. */
export function BillingAdmin() {
  const summary = useAsync(() => api.get<Summary>('/platform/billing/summary'), []);
  const [state, setState] = useState('');
  const mandals = usePagedList<MandalRow>('/platform/billing/mandals', { state: state || undefined }, { pageSize: 20 });
  const txs = usePagedList<TxRow>('/platform/billing/transactions', {}, { pageSize: 20 });
  const [editing, setEditing] = useState<MandalRow | null>(null);
  const s = summary.data;
  const reload = () => { summary.reload(); mandals.reload(); txs.reload(); };

  return (
    <div className="flex flex-col gap-4">
      {s && (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-5 text-white shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Your platform earnings</p>
            <p className="text-4xl font-black">{fmtMoney(s.totalEarned)}</p>
            <p className="text-sm text-white/90">
              Event registration fees {fmtMoney(s.eventFeesEarned)}{s.eventFeesPaid ? ` (${s.eventFeesPaid} paid)` : ''} · Pass credit commission {fmtMoney(s.commissionEarned)} · Online split commission {fmtMoney(s.splitCommissionEarned)} · Promotional partners {fmtMoney(s.promotionalPartnerEarned)} · Landing pages {fmtMoney(s.landingPageEarned)}{s.landingPagesSold ? ` (${s.landingPagesSold} sold)` : ''}
              {Number(s.partnerFeesEarned) > 0 ? ` · Legacy sponsor print fees ${fmtMoney(s.partnerFeesEarned)}` : ''}
            </p>
            <p className="mt-1 text-xs text-white/75">Online payments collected: {fmtMoney(s.onlineGross)} · Partner wallets held: {fmtMoney(s.partnerWalletsOutstanding)} · Owed to field agents: {fmtMoney(s.agentEarningsDue)} (paid {fmtMoney(s.agentPayoutsMade)})</p>
          </section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Passes generated" value={s.tokensGenerated.toLocaleString('en-IN')} tone="blue" icon={Ticket} />
            <Stat label="Credit held by mandals" value={fmtMoney(s.creditOutstanding)} tone="green" icon={Wallet} />
            <Stat label="Total recharged" value={fmtMoney(s.totalRecharged)} tone="brand" icon={Coins} />
            <Stat label="Mandals low / out" value={`${s.mandals.low} / ${s.mandals.exhausted}`} tone={s.mandals.exhausted ? 'red' : 'amber'} icon={AlertTriangle} />
          </div>
        </>
      )}

      <SettingsCard onSaved={reload} />

      <SectionTitle icon={Building2}>Mandal credit</SectionTitle>
      <SearchBar value={mandals.search} onChange={mandals.setSearch} placeholder="Search mandal or city" total={mandals.total}>
        <div className="sm:w-44">
          <LabeledSelect label="Credit" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            <option value="LOW">Low</option>
            <option value="EXHAUSTED">Exhausted</option>
            <option value="OK">OK</option>
          </LabeledSelect>
        </div>
      </SearchBar>
      {mandals.loading && !mandals.data ? (
        <SkeletonList />
      ) : mandals.items.length === 0 ? (
        <Empty title="No mandals match" />
      ) : (
        <Card>
          <Table head={['Mandal', 'Credit', 'Passes left', 'Price · commission', 'Passes made', 'Commission paid', 'Landing page', '']}>
            {mandals.items.map((m) => (
              <tr key={m.id}>
                <Td>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-slate-500">{[m.city, m.state].filter(Boolean).join(', ')}</div>
                </Td>
                <Td>
                  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', STATE_STYLE[m.billing.state])}>
                    {m.billing.state === 'EXHAUSTED' && <AlertOctagon aria-hidden className="h-3 w-3" />}
                    {fmtMoney(m.billing.balance)}
                  </span>
                </Td>
                <Td>{m.billing.tokensLeft ?? '∞'}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {fmtMoney(m.billing.tokenPrice)} · {Number(m.billing.commissionPercent)}% = {fmtMoney(m.billing.feePerPass)}
                  {(m.billing.overrides.tokenPrice || m.billing.overrides.commission) && <Badge className="ml-1 bg-violet-100 text-violet-800">custom</Badge>}
                </Td>
                <Td>{m.billing.totals.tokens.toLocaleString('en-IN')}</Td>
                <Td>{fmtMoney(m.billing.totals.fees)}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {m.billing.landingPage.active ? <Badge value="ACTIVE">until {fmtDate(m.billing.landingPage.paidUntil!.slice(0, 10))}</Badge> : <span className="text-slate-500">—</span>}
                  <div className="text-slate-500">{fmtMoney(m.billing.landingPage.price)}/yr{m.billing.overrides.landingPagePrice ? ' · custom' : ''}</div>
                </Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                    <SlidersHorizontal aria-hidden className="h-4 w-4" /> Manage
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Pager page={mandals.page} pageSize={mandals.pageSize} total={mandals.total} onPage={mandals.setPage} />

      <SectionTitle icon={Coins}>All credit transactions</SectionTitle>
      {txs.items.length === 0 ? (
        <Empty title="No transactions yet" />
      ) : (
        <Card>
          <Table head={['When', 'Mandal', 'What', 'Passes', 'Amount', 'Balance']}>
            {txs.items.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</Td>
                <Td className="font-semibold">{t.organization.name}</Td>
                <Td className="text-xs">
                  {t.type.replace('_', ' ')}{t.source ? ` · ${t.source}` : ''}
                  <div className="text-slate-500">{[t.event?.name, t.reference, t.note].filter(Boolean).join(' · ')}</div>
                </Td>
                <Td>{t.tokenCount || '—'}</Td>
                <Td className={cx('font-bold tabular-nums', Number(t.amount) < 0 ? 'text-red-700' : 'text-green-700')}>{fmtMoney(t.amount)}</Td>
                <Td className="tabular-nums">{fmtMoney(t.balanceAfter)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Pager page={txs.page} pageSize={txs.pageSize} total={txs.total} onPage={txs.setPage} />

      {editing && <ManageMandal m={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const q = useAsync(() => api.get<Settings>('/platform/billing/settings'), []);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = form ?? q.data;
  if (!f) return q.loading ? <SkeletonList rows={1} /> : null;
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') });
  const fee = (Number(f.defaultTokenPrice || 0) * Number(f.defaultCommissionPercent || 0)) / 100;

  async function save() {
    setError(null);
    setOk(false);
    setBusy(true);
    try {
      const { defaultTokenPrice, defaultCommissionPercent, lowCreditThreshold, welcomeCredit, partnerRate, gatewayFeePercent, defaultPassPrintFormat, landingPageYearlyPrice } = f!;
      const saved = await api.put<Settings>('/platform/billing/settings', { defaultTokenPrice, defaultCommissionPercent, lowCreditThreshold, welcomeCredit, partnerRate, gatewayFeePercent, defaultPassPrintFormat, landingPageYearlyPrice });
      setForm(saved);
      setOk(true);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={Settings2}>Commission &amp; pricing rules</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LabeledInput label="Default token price (₹)" inputMode="decimal" value={f.defaultTokenPrice} onChange={set('defaultTokenPrice')} />
        <LabeledInput label="Commission per token (%)" inputMode="decimal" value={f.defaultCommissionPercent} onChange={set('defaultCommissionPercent')} />
        <LabeledInput label="Low-credit warning below (₹)" inputMode="decimal" value={f.lowCreditThreshold} onChange={set('lowCreditThreshold')} />
        <LabeledInput label="Default partner rate per pass (₹)" inputMode="decimal" value={f.partnerRate} onChange={set('partnerRate')} hint="Paid by promotional partners (brands) per pass printed — never by the mandal" />
        <LabeledSelect label="Default pass print format" value={f.defaultPassPrintFormat ?? 'AUTO'} onChange={(e) => setForm({ ...f, defaultPassPrintFormat: e.target.value })} hint="Mandals can't change this — partner ads print on passes">
          {PRINT_SETTINGS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </LabeledSelect>
        <LabeledInput label="Welcome credit for new mandals (₹)" inputMode="decimal" value={f.welcomeCredit} onChange={set('welcomeCredit')} />
        <LabeledInput label="Gateway fee taken from the mandal's share (%)" inputMode="decimal" value={f.gatewayFeePercent ?? ''} onChange={set('gatewayFeePercent')} hint="Applied to each paid online pass before the mandal's net" />
        <LabeledInput label="Landing page yearly fee (₹)" inputMode="decimal" value={f.landingPageYearlyPrice ?? ''} onChange={set('landingPageYearlyPrice')} hint="Default price of a mandal page at /m/<slug> for one year" />
      </div>
      <p className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
        <Percent aria-hidden className="h-4 w-4" /> Each person admitted costs a mandal {fmtMoney(fee)} ({f.defaultCommissionPercent}% of {fmtMoney(f.defaultTokenPrice)}). Mandal-specific rates override this.
      </p>
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">Saved. New rates apply to passes generated from now on.</Alert>}
      <div>
        <Button loading={busy} onClick={() => void save()}>
          <Save aria-hidden className="h-4 w-4" /> Save rules
        </Button>
      </div>
    </Card>
  );
}

function ManageMandal({ m, onClose, onSaved }: { m: MandalRow; onClose: () => void; onSaved: () => void }) {
  const b = m.billing;
  const [price, setPrice] = useState(b.overrides.tokenPrice ? b.tokenPrice : '');
  const [pct, setPct] = useState(b.overrides.commission ? b.commissionPercent : '');
  const [low, setLow] = useState(b.overrides.lowCreditThreshold ? b.lowCreditThreshold : '');
  const [print, setPrint] = useState(b.overrides.partnerRate ? b.partnerRatePerPass : '');
  const [format, setFormat] = useState(b.overrides.passPrintFormat ? b.passPrintFormat : '');
  const [landingPrice, setLandingPrice] = useState(b.overrides.landingPagePrice ? b.landingPage.price : '');
  const [eventFee, setEventFee] = useState(b.eventFee ?? '');
  const [grantYears, setGrantYears] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const v = (x: string) => (x.trim() === '' ? null : x.trim());

  return (
    <Modal open onClose={onClose} title={m.name}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Credit" value={fmtMoney(b.balance)} tone={b.state === 'EXHAUSTED' ? 'red' : b.state === 'LOW' ? 'amber' : 'green'} icon={Wallet} />
          <Stat label="Passes left" value={b.tokensLeft ?? '∞'} tone="blue" icon={Ticket} />
        </div>
        <SectionTitle icon={BadgeIndianRupee}>Pricing for this mandal</SectionTitle>
        <p className="-mt-2 text-xs text-slate-500">Leave a field empty to use the platform default.</p>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Token price (₹)" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="default" />
          <LabeledInput label="Commission (%)" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="default" />
          <LabeledInput label="Low warning (₹)" value={low} onChange={(e) => setLow(e.target.value.replace(/[^\d.]/g, ''))} placeholder="default" />
          <LabeledInput label="Partner rate per pass (₹)" value={print} onChange={(e) => setPrint(e.target.value.replace(/[^\d.]/g, ''))} placeholder="default" />
          <LabeledInput label="Landing page fee / year (₹)" value={landingPrice} onChange={(e) => setLandingPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="default" />
          <LabeledInput label="Event registration fee (₹)" value={eventFee} onChange={(e) => setEventFee(e.target.value.replace(/[^\d.]/g, ''))} placeholder="by festival type" hint="Beats festival-type & default fees" />
          <div className="col-span-2">
            <LabeledSelect label="Pass print format" value={format} onChange={(e) => setFormat(e.target.value)} hint={`Currently: ${b.passPrintFormat}`}>
              <option value="">Platform default</option>
              {PRINT_SETTINGS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </LabeledSelect>
          </div>
        </div>
        <Button variant="secondary" loading={busy} onClick={() => void run(() => api.patch(`/platform/billing/mandals/${m.id}`, { tokenPrice: v(price), commissionPercent: v(pct), lowCreditThreshold: v(low), partnerRate: v(print), passPrintFormat: format || null, landingPagePrice: v(landingPrice), eventFee: v(eventFee) }))}>
          <Save aria-hidden className="h-4 w-4" /> Save pricing
        </Button>
        <SectionTitle icon={Globe}>Landing page</SectionTitle>
        <p className="-mt-2 text-sm text-slate-600">
          {b.landingPage.active ? `Active until ${fmtDate(b.landingPage.paidUntil!.slice(0, 10))}.` : b.landingPage.paidUntil ? `Expired on ${fmtDate(b.landingPage.paidUntil.slice(0, 10))}.` : 'Not active.'} Grants are free (not revenue) and audited.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <LabeledSelect label="Extend by" value={grantYears} onChange={(e) => setGrantYears(e.target.value)}>
            {[1, 2, 3, 5].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
          </LabeledSelect>
          <LabeledInput label="Reason" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} placeholder="Launch partner / paid by cheque" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy} disabled={grantReason.trim().length < 3} onClick={() => void run(() => api.post(`/platform/landing-pages/${m.id}/grant`, { years: Number(grantYears), reason: grantReason.trim() }))}>
            Grant / extend
          </Button>
          {b.landingPage.active && (
            <Button variant="danger" loading={busy} disabled={grantReason.trim().length < 3} onClick={() => window.confirm('Switch this mandal’s landing page off now?') && void run(() => api.post(`/platform/landing-pages/${m.id}/revoke`, { reason: grantReason.trim() }))}>
              Revoke now
            </Button>
          )}
        </div>
        <SectionTitle icon={Handshake}>Add or deduct credit</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Amount (₹, use − to deduct)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="e.g. 1000" />
          <LabeledInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="UPI ref / correction" />
        </div>
        <Button loading={busy} disabled={!amount || reason.trim().length < 3} onClick={() => void run(() => api.post(`/platform/billing/mandals/${m.id}/adjust`, { amount, reason: reason.trim() }))}>
          <Coins aria-hidden className="h-4 w-4" /> Apply
        </Button>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
