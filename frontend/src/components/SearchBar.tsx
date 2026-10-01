'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Search input with icon + clear button; optional filter controls beside it. */
export function SearchBar({ value, onChange, placeholder = 'Search…', children, total }: { value: string; onChange: (v: string) => void; placeholder?: string; children?: ReactNode; total?: number }) {
  return (
    <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="relative flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-[48px] w-full rounded-xl border border-orange-200 bg-white pl-10 pr-10 text-base placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700">
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
      {typeof total === 'number' && <span className="shrink-0 self-center text-sm text-slate-500 sm:pb-3">{total} found</span>}
    </div>
  );
}
