'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Info, Inbox, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cx } from '@/lib/cx';
export { cx };

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-md shadow-orange-500/25 hover:brightness-105 active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  secondary: 'bg-white text-slate-900 border border-orange-200 hover:bg-orange-50 active:bg-orange-100 disabled:text-slate-400',
  danger: 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md shadow-red-500/20 hover:brightness-105 active:brightness-95 disabled:opacity-50',
  success: 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-green-500/20 hover:brightness-105 active:brightness-95 disabled:opacity-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-orange-50 active:bg-orange-100',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed',
        size === 'sm' && 'min-h-[40px] px-3 text-sm',
        size === 'md' && 'min-h-[48px] px-4 text-base',
        size === 'lg' && 'min-h-[64px] px-6 text-xl',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-orange-100 bg-white p-4 shadow-sm shadow-orange-900/5', className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

const inputCls =
  'min-h-[48px] w-full rounded-xl border border-orange-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:bg-slate-100';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === 'password') return <PasswordInput {...props} />;
  return <input {...props} className={cx(inputCls, props.className)} />;
}

/** Password field with a show/hide (eye) toggle. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cx(inputCls, 'pr-12', props.className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-orange-600 focus:outline-none focus-visible:text-orange-600"
      >
        {show ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'pr-8', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[96px] py-2', props.className)} />;
}

export function LabeledInput({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <Input id={id} {...rest} />
    </Field>
  );
}

export function LabeledSelect({
  label,
  hint,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Select id={id} {...rest}>
        {children}
      </Select>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base">
      <input
        type="checkbox"
        className="h-5 w-5 accent-brand-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success' | 'warning'; children: ReactNode }) {
  if (!children) return null;
  const cls = {
    error: 'border-red-300 bg-red-50 text-red-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    success: 'border-green-300 bg-green-50 text-green-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
  }[kind];
  const Icon = { error: XCircle, info: Info, success: CheckCircle2, warning: AlertTriangle }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', cls)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-orange-100/70', className)} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-10 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
        <Icon aria-hidden className="h-6 w-6" />
      </span>
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export type StatTone = 'default' | 'green' | 'red' | 'amber' | 'brand' | 'blue' | 'purple' | 'pink' | 'slate';

const STAT_TONES: Record<StatTone, { card: string; icon: string; value: string }> = {
  default: { card: 'bg-white border-orange-100', icon: 'bg-orange-100 text-orange-600', value: 'text-slate-900' },
  brand: { card: 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200', icon: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white', value: 'text-orange-700' },
  green: { card: 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200', icon: 'bg-gradient-to-br from-emerald-400 to-green-600 text-white', value: 'text-green-700' },
  red: { card: 'bg-gradient-to-br from-rose-50 to-red-50 border-rose-200', icon: 'bg-gradient-to-br from-rose-400 to-red-600 text-white', value: 'text-red-700' },
  amber: { card: 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200', icon: 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white', value: 'text-amber-700' },
  blue: { card: 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-200', icon: 'bg-gradient-to-br from-sky-400 to-blue-600 text-white', value: 'text-blue-700' },
  purple: { card: 'bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200', icon: 'bg-gradient-to-br from-violet-400 to-purple-600 text-white', value: 'text-purple-700' },
  pink: { card: 'bg-gradient-to-br from-pink-50 to-fuchsia-50 border-pink-200', icon: 'bg-gradient-to-br from-pink-400 to-fuchsia-600 text-white', value: 'text-fuchsia-700' },
  slate: { card: 'bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200', icon: 'bg-gradient-to-br from-slate-400 to-slate-600 text-white', value: 'text-slate-700' },
};

export function Stat({ label, value, tone = 'default', icon: Icon }: { label: string; value: ReactNode; tone?: StatTone; icon?: LucideIcon }) {
  const t = STAT_TONES[tone];
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5 rounded-2xl border p-3 shadow-sm', t.card)}>
      {Icon && (
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', t.icon)}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{label}</div>
        <div
          className={cx(
            'break-words font-extrabold tabular-nums leading-tight',
            typeof value === 'string' && value.length > 8 ? 'text-lg' : 'text-2xl',
            t.value,
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUCCESS: 'bg-green-100 text-green-800',
  APPROVED: 'bg-green-100 text-green-800',
  USED: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-sky-100 text-sky-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  REQUESTED: 'bg-amber-100 text-amber-800',
  PAUSED: 'bg-violet-100 text-violet-800',
  ENDED: 'bg-slate-200 text-slate-700',
  SUSPENDED: 'bg-red-100 text-red-800',
  NOT_YET_VALID: 'bg-amber-100 text-amber-800',
  EXPIRED: 'bg-slate-200 text-slate-700',
  INACTIVE: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
  DISABLED: 'bg-red-100 text-red-800',
  ALREADY_USED: 'bg-red-100 text-red-800',
  INVALID: 'bg-red-100 text-red-800',
  WRONG_EVENT: 'bg-red-100 text-red-800',
  UNAUTHORIZED: 'bg-red-100 text-red-800',
};

export function Badge({ value, children, className }: { value?: string | null; children?: ReactNode; className?: string }) {
  const tone = (value && BADGE_TONES[value]) || 'bg-slate-100 text-slate-700';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', tone, className)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children ?? (value ? value.replace(/_/g, ' ') : '—')}
    </span>
  );
}

/** Bottom sheet on mobile, centered dialog on larger screens. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  // Portal to <body>: an ancestor with backdrop-filter/transform (e.g. the blurred sticky
  // header) would otherwise become the containing block and clip this fixed overlay.
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white pb-safe shadow-xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export interface TabDef {
  key: string;
  label: string;
  icon?: LucideIcon;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="no-print -mx-4 overflow-x-auto px-4" role="tablist">
      <div className="flex w-max gap-2 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => onChange(t.key)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all',
              active === t.key
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-md shadow-orange-500/30'
                : 'bg-white text-slate-700 ring-1 ring-orange-200 hover:bg-orange-50',
            )}
          >
            {t.icon && <t.icon aria-hidden className="h-4 w-4" />}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Section navigation: a vertical sidebar on desktop (sticky, content to the
 * right) and a wrapping grid of buttons on phones — never a scroll bar.
 */
export function SideTabsLayout({ tabs, active, onChange, children }: { tabs: TabDef[]; active: string; onChange: (k: string) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <nav aria-label="Sections" className="no-print lg:sticky lg:top-20 lg:w-56 lg:shrink-0">
        <div role="tablist" aria-orientation="vertical" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1 lg:rounded-2xl lg:border lg:border-orange-100 lg:bg-white lg:p-2 lg:shadow-sm">
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onChange(t.key)}
                className={cx(
                  'flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold transition-all',
                  on
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-md shadow-orange-500/25'
                    : 'bg-white text-slate-700 ring-1 ring-orange-200 hover:bg-orange-50 lg:ring-0',
                )}
              >
                {t.icon && <t.icon aria-hidden className={cx('h-4 w-4 shrink-0', on ? 'text-white' : 'text-orange-500')} />}
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize && page === 1) return null;
  return (
    <div className="no-print mt-3 flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden className="h-4 w-4" /> Prev
      </Button>
      <span className="text-sm text-slate-600">
        Page {page} of {pages} · {total} total
      </span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function SectionTitle({ children, action, icon: Icon }: { children: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Icon aria-hidden className="h-4 w-4" />
          </span>
        ) : (
          <span aria-hidden className="h-5 w-1.5 rounded-full bg-gradient-to-b from-amber-400 to-rose-500" />
        )}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A simple CSS bar chart (no chart library). */
export function BarChart({ data, label }: { data: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <Empty title="No data yet" />;
  return (
    <figure aria-label={label}>
      <div className="flex h-40 items-end gap-1 overflow-x-auto rounded-xl bg-gradient-to-b from-orange-50/60 to-white p-2 ring-1 ring-orange-100">
        {data.map((d) => (
          <div key={d.key} className="flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.value}`}>
            <span className="text-[10px] font-semibold tabular-nums text-slate-600">{d.value > 0 ? d.value : ''}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-orange-500 to-amber-300"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
            />
            <span className="text-[10px] text-slate-500">{d.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

/** Responsive table wrapper with horizontal scroll on small screens. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b border-orange-200 bg-orange-50/80 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-orange-900/70">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx('border-b border-orange-50 px-3 py-2 align-top', className)}>{children}</td>;
}
