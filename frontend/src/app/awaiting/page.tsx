'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAwaitingApproval, useRequireAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { Hourglass, LogOut, RefreshCw } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { AuthCard } from '@/components/AuthCard';

export default function AwaitingPage() {
  const { me, loading, refresh, logout } = useRequireAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && me && !isAwaitingApproval(me)) router.replace('/dashboard');
  }, [loading, me, router]);

  return (
    <AuthCard title="Awaiting approval" subtitle="Your request has been sent to the mandal.">
      <div className="flex flex-col gap-4">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-orange-600">
          <Hourglass aria-hidden className="h-8 w-8" />
        </span>
        <p className="text-slate-700">
          An organiser will review it. Once approved, you will be able to scan or issue tokens here. Please check again later.
        </p>
        {me?.applications.map((a) => (
          <Card key={a.id} className="bg-orange-50/50">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{a.organization.name}</div>
              <Badge value={a.status} />
            </div>
            {a.event && <div className="text-sm text-slate-600">{a.event.name}</div>}
            <div className="mt-1 text-xs text-slate-500">Sent {fmtDateTime(a.createdAt)}</div>
            {a.reviewNote && <div className="mt-2 text-sm">Note: {a.reviewNote}</div>}
          </Card>
        ))}
        <Button
          size="lg"
          loading={checking}
          onClick={async () => {
            setChecking(true);
            await refresh();
            setChecking(false);
          }}
        >
          {!checking && <RefreshCw aria-hidden className="h-6 w-6" />}
          Check again
        </Button>
        <Button variant="secondary" onClick={logout}>
          <LogOut aria-hidden className="h-5 w-5" /> Log out
        </Button>
      </div>
    </AuthCard>
  );
}
