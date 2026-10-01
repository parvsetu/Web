import Link from 'next/link';
import type { ReactNode } from 'react';
import { FestivalArt, LogoMark, Mandala, Toran } from './FestivalArt';

const SHOWCASE = ['GANESH_UTSAV', 'DURGA_PUJA', 'NAVRATRI', 'JANMASHTAMI', 'DIWALI'];

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 pb-8 pt-safe">
      {/* festive backdrop */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[300px] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600" />
      <Toran className="absolute inset-x-0 top-0 w-full" />
      <Mandala className="pointer-events-none absolute -right-20 -top-10 h-72 w-72 text-white/15" />
      <Mandala className="pointer-events-none absolute -left-24 top-32 h-56 w-56 text-white/10" />

      <div className="relative mt-10 flex flex-col items-center gap-2 text-white">
        <Link href="/book" aria-label="Parvsetu home — explore events" className="flex flex-col items-center gap-2 rounded-2xl p-1 transition hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
          <LogoMark className="h-16 w-16 drop-shadow-lg" />
          <span className="text-3xl font-extrabold tracking-tight drop-shadow-sm">Parvsetu</span>
        </Link>
        <span className="text-sm font-medium text-white/90">Festival &amp; mandal management</span>
        <div className="mt-3 flex items-center gap-2">
          {SHOWCASE.map((t) => (
            <span key={t} className="h-11 w-11 rounded-full bg-white/95 p-1.5 shadow-md ring-2 ring-white/40">
              <FestivalArt type={t} className="h-full w-full" />
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-6 w-full max-w-md rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-900/10">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mb-5 mt-1 text-slate-600">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
