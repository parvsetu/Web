'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Alert, Button } from './ui';

/**
 * Shown when the API answers 404 for a festival or mandal. The server sends
 * the same 404 for "doesn't exist" and "you have no access", so other
 * mandals' existence stays hidden (docs/ARCHITECTURE.md → Isolation). This
 * screen must not try to tell the two apart. It only explains both
 * possibilities, says which account is signed in, and mentions the user's
 * own pending join request, which is theirs to see anyway.
 */
export function NoAccessNotice({ kind, id }: { kind: 'festival' | 'mandal'; id: string }) {
  const { me, refresh } = useAuth();
  const [checking, setChecking] = useState(false);
  const pending = me?.applications.find(
    (a) => a.status === 'PENDING' && (kind === 'festival' ? a.event?.id === id : a.organization.id === id),
  );
  const account = me ? me.email || me.mobile || me.name : null;

  async function checkAgain() {
    setChecking(true);
    try {
      await refresh();
      window.location.reload();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Alert kind="warning">
      <p className="font-semibold">We couldn&apos;t open this {kind}.</p>
      {pending ? (
        <p className="mt-1">
          Your request to join <strong>{pending.event?.name ?? pending.organization.name}</strong> is waiting for the mandal admin&apos;s approval. This page opens
          once they approve it.
        </p>
      ) : (
        <>
          <p className="mt-1">Either the link is wrong, or you haven&apos;t been added to this {kind} yet.</p>
          <p className="mt-1">
            If you&apos;re helping here, ask the mandal admin to add you{kind === 'festival' ? ' to this festival' : ''}, then tap &ldquo;Check again&rdquo;.
          </p>
        </>
      )}
      {account ? (
        <p className="mt-1 text-xs opacity-80">
          Signed in as <strong>{account}</strong> — the admin needs to add this account. Wrong one? Sign out and sign in with the account the admin added.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={checking} onClick={() => void checkAgain()}>
          Check again
        </Button>
        <Link href="/dashboard" className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold underline">
          Go to my dashboard
        </Link>
      </div>
    </Alert>
  );
}
