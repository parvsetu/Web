'use client';

import { useEffect, useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50',
  success: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:bg-green-600/50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200',
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
  return <div className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
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
  'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:bg-slate-100';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
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
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm', cls)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200', className)} />;
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'green' | 'red' | 'amber' | 'brand' }) {
  const toneCls = {
    default: 'text-slate-900',
    green: 'text-green-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    brand: 'text-brand-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-bold tabular-nums', toneCls)}>{value}</div>
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
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tone, className)}>
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
  if (!open) return null;
  return (
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export interface TabDef {
  key: string;
  label: string;
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
              'min-h-[44px] whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors',
              active === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize && page === 1) return null;
  return (
    <div className="no-print mt-3 flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </Button>
      <span className="text-sm text-slate-600">
        Page {page} of {pages} · {total} total
      </span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </Button>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
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
      <div className="flex h-40 items-end gap-1 overflow-x-auto rounded-xl bg-slate-50 p-2">
        {data.map((d) => (
          <div key={d.key} className="flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.value}`}>
            <span className="text-[10px] font-semibold tabular-nums text-slate-600">{d.value > 0 ? d.value : ''}</span>
            <div
              className="w-full rounded-t-md bg-brand-500"
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
              <th key={i} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">
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
  return <td className={cx('border-b border-slate-100 px-3 py-2 align-top', className)}>{children}</td>;
}
