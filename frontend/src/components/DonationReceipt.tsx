import { BadgeCheck } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { DEFAULT_TZ, fmtMoney, humanize } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { FestivalArt, Mandala, Toran } from './FestivalArt';

const METHOD_LABEL: Record<string, string> = { UPI: 'UPI', CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', ONLINE: 'Online', OTHER: 'Other' };

function fullDate(iso: string, tz?: string | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: tz || DEFAULT_TZ, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  } catch {
    return d.toLocaleString('en-IN');
  }
}

/**
 * Printable donation receipt (A5-ish card). Colours print exactly; wrap the
 * page's other chrome in `.no-print` so only this card ends up on paper.
 */
export function DonationReceipt({ r, timezone }: { r: Receipt; timezone?: string | null }) {
  const t = festivalTheme(r.event.festivalType);
  const issuer = r.issuer;
  const orgAddress = [r.organization.address, r.organization.city, r.organization.state].filter(Boolean).join(', ');
  return (
    <article className="donation-receipt mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-xl shadow-orange-900/10">
      <style>{`@media print { .donation-receipt { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; border-color: #fdba74 !important; break-inside: avoid; max-width: 160mm; } }`}</style>
      <header className="relative overflow-hidden px-5 pb-5 pt-8 text-white" style={{ background: gradient(t) }}>
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-14 -top-10 h-48 w-48 text-white/15" />
        <div className="relative flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 rounded-full bg-white/95 p-2 shadow-md ring-4 ring-white/30">
            <FestivalArt type={r.event.festivalType} className="h-full w-full" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">{r.event.name}</p>
            <h1 className="text-2xl font-extrabold leading-tight drop-shadow-sm">{r.organization.name}</h1>
            {orgAddress && <p className="mt-0.5 text-sm text-white/90">{orgAddress}</p>}
          </div>
        </div>
      </header>

      <div className="px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-dashed border-orange-200 pb-3">
          <h2 className="text-lg font-black uppercase tracking-[0.2em]" style={{ color: t.ink }}>
            Donation Receipt
          </h2>
          <div className="text-sm sm:text-right">
            <div className="text-slate-500">Receipt no.</div>
            <div className="font-mono text-base font-bold text-slate-900">{r.receiptNo}</div>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">Received with thanks from</p>
        <p className="text-2xl font-extrabold text-slate-900">{r.donorName}</p>

        <div className="mt-4 rounded-2xl p-4 ring-1 ring-orange-100" style={{ background: t.soft }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The sum of</p>
          <p className="text-4xl font-black tabular-nums" style={{ color: t.ink }}>
            {fmtMoney(r.amount, r.currency || 'INR')}
          </p>
          <p className="mt-1 text-sm italic text-slate-700">{r.amountInWords}</p>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-semibold text-slate-900">{fullDate(r.donatedAt, timezone)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Payment mode</dt>
            <dd className="font-semibold text-slate-900">{METHOD_LABEL[r.method] ?? humanize(r.method)}</dd>
          </div>
          {r.paymentReference && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Payment reference</dt>
              <dd className="break-all font-mono font-semibold text-slate-900">{r.paymentReference}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Towards</dt>
            <dd className="font-semibold text-slate-900">{r.event.name}</dd>
          </div>
        </dl>

        {issuer && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <BadgeCheck aria-hidden className="h-4 w-4 text-emerald-600" /> Issued by
            </p>
            <p className="font-bold text-slate-900">{issuer.legalName}</p>
            <p className="text-slate-600">{issuer.address}</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {issuer.registrationNumber && (
                <div className="flex gap-2">
                  <dt className="text-slate-500">Reg. no.</dt>
                  <dd className="font-semibold">{issuer.registrationNumber}</dd>
                </div>
              )}
              {issuer.pan && (
                <div className="flex gap-2">
                  <dt className="text-slate-500">PAN</dt>
                  <dd className="font-mono font-semibold">{issuer.pan}</dd>
                </div>
              )}
              {issuer.reg80G && (
                <div className="flex gap-2">
                  <dt className="text-slate-500">80G</dt>
                  <dd className="font-semibold">{issuer.reg80G}</dd>
                </div>
              )}
              {issuer.reg12A && (
                <div className="flex gap-2">
                  <dt className="text-slate-500">12A</dt>
                  <dd className="font-semibold">{issuer.reg12A}</dd>
                </div>
              )}
            </dl>
            {issuer.reg80G && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900 ring-1 ring-emerald-200">
                Donations are eligible for deduction under section 80G of the Income-tax Act.
              </p>
            )}
          </section>
        )}

        <footer className="mt-8 flex items-end justify-between gap-4 text-sm">
          <p className="max-w-[60%] text-slate-600">
            🙏 Thank you for your generous contribution.
            <span className="mt-1 block text-[11px] text-slate-400">Computer-generated receipt · Parvsetu</span>
          </p>
          <span className="shrink-0 border-t border-slate-400 pt-1 text-slate-600">Authorised signatory</span>
        </footer>
      </div>
    </article>
  );
}
