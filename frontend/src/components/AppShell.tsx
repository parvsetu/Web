'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { api, errorMessage, setToken } from '@/lib/api';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { ArrowLeft, BriefcaseBusiness, CalendarHeart, ClipboardCheck, Handshake, HelpCircle, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { LogoMark } from './FestivalArt';
import { Alert, Button, LabeledInput, Modal, SkeletonList, cx } from './ui';

export function AppShell({
  title,
  subtitle,
  back,
  children,
  right,
  wide,
  bare,
  festivalType,
}: {
  title: string;
  subtitle?: string;
  /** href for the back button; omit for none. */
  back?: string;
  children: ReactNode;
  right?: ReactNode;
  wide?: boolean;
  /** No padding container (scanner). */
  bare?: boolean;
  /** Tints the header accent with that festival's colours. */
  festivalType?: string | null;
}) {
  const { me, loading } = useRequireAuth();
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="no-print sticky top-0 z-30 bg-white/90 pt-safe shadow-sm shadow-orange-900/5 backdrop-blur">
        <div className={cx('mx-auto flex h-14 items-center gap-2 px-2', wide ? 'max-w-6xl' : 'max-w-3xl')}>
          {back ? (
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.push(back)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-orange-50"
            >
              <ArrowLeft aria-hidden className="h-6 w-6" />
            </button>
          ) : (
            <Link href="/dashboard" aria-label="My dashboard" className="flex h-12 shrink-0 items-center gap-2 px-1">
              <LogoMark className="h-9 w-9 drop-shadow-sm" />
              <span className="hidden bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-lg font-extrabold text-transparent sm:inline">Parvsetu</span>
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold leading-tight text-slate-900">{title}</div>
            {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
          </div>
          {right}
          <UserMenu />
        </div>
        <div aria-hidden className="h-1 w-full" style={{ background: gradient(festivalTheme(festivalType), 90) }} />
      </header>
      <main className={cx('flex-1 pb-safe', !bare && 'mx-auto w-full px-4 py-4', !bare && (wide ? 'max-w-6xl' : 'max-w-3xl'))}>
        {loading || !me ? (bare ? <div className="p-4"><SkeletonList /></div> : <SkeletonList />) : children}
      </main>
    </div>
  );
}

const menuItem = 'flex min-h-[48px] items-center gap-3 px-4 py-3 hover:bg-orange-50';

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  if (!me) return null;
  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-12 items-center justify-center rounded-full"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-sm font-bold text-white shadow-sm ring-2 ring-white">{initials || '?'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3">
              <div className="font-semibold">{me.name}</div>
              <div className="text-xs text-slate-500">{me.mobile || me.email}</div>
            </div>
            {me.partner ? (
              <Link href="/partner" className={menuItem} onClick={() => setOpen(false)}>
                <Handshake aria-hidden className="h-5 w-5 text-fuchsia-500" /> Partner dashboard
              </Link>
            ) : me.agent ? (
              <Link href="/agent" className={menuItem} onClick={() => setOpen(false)}>
                <BriefcaseBusiness aria-hidden className="h-5 w-5 text-emerald-600" /> Agent dashboard
              </Link>
            ) : (
              <Link href="/dashboard" className={menuItem} onClick={() => setOpen(false)}>
                <CalendarHeart aria-hidden className="h-5 w-5 text-orange-500" /> My festivals
              </Link>
            )}
            {(me.mandalRegistrations?.length ?? 0) > 0 && (
              <Link href="/registration" className={menuItem} onClick={() => setOpen(false)}>
                <ClipboardCheck aria-hidden className="h-5 w-5 text-emerald-600" /> Mandal registration
              </Link>
            )}
            <Link href="/profile" className={menuItem} onClick={() => setOpen(false)}>
              <UserRound aria-hidden className="h-5 w-5 text-fuchsia-500" /> My profile
            </Link>
            <Link href="/faq" className={menuItem} onClick={() => setOpen(false)}>
              <HelpCircle aria-hidden className="h-5 w-5 text-sky-500" /> Help &amp; FAQ
            </Link>
            {me.isSuperAdmin && (
              <Link href="/platform" className={menuItem} onClick={() => setOpen(false)}>
                <ShieldCheck aria-hidden className="h-5 w-5 text-violet-500" /> Platform admin
              </Link>
            )}
            <button
              type="button"
              className={cx(menuItem, 'w-full text-left')}
              onClick={() => {
                setOpen(false);
                setPwOpen(true);
              }}
            >
              <KeyRound aria-hidden className="h-5 w-5 text-amber-500" /> Change password
            </button>
            <button type="button" className={cx(menuItem, 'w-full text-left text-red-700 hover:bg-red-50')} onClick={logout}>
              <LogOut aria-hidden className="h-5 w-5" /> Log out
            </button>
          </div>
        </>
      )}
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      const r = await api.post<{ accessToken: string }>('/auth/change-password', { currentPassword: current, newPassword: next }, { noAuthRedirect: true });
      setToken(r.accessToken);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDone(false);
        setError(null);
        onClose();
      }}
      title="Change password"
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success">Password changed. Other devices have been signed out.</Alert>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LabeledInput label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <LabeledInput label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} required />
          <LabeledInput label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>
            Change password
          </Button>
        </form>
      )}
    </Modal>
  );
}
