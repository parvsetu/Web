import type { ReactNode } from 'react';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-8 pt-safe">
      <div className="mb-6 flex flex-col items-center gap-2">
        <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-extrabold text-white shadow">
          P
        </span>
        <span className="text-2xl font-extrabold tracking-tight text-brand-800">Parvsetu</span>
      </div>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mb-5 mt-1 text-slate-600">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
