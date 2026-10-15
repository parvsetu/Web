'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, LayoutDashboard, Megaphone, Send, UserRound, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import type { PartnerOverview } from '@/lib/partner-types';
import { AppShell } from '@/components/AppShell';
import { Mandala } from '@/components/FestivalArt';
import { Alert, Badge, SideTabsLayout, SkeletonList } from '@/components/ui';
import { PartnerLogo, PartnerRechargeModal, PartnerStatusBanner } from '@/components/partner/PartnerParts';
import { CampaignsTab, NewCampaignTab, OverviewTab, ProfileTab, WalletTab } from '@/components/partner/PartnerTabs';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'new', label: 'New campaign', icon: Send },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'wallet', label: 'Wallet', icon: Wallet },
  { key: 'profile', label: 'Brand profile', icon: UserRound },
];

/** Promotional partner (brand) dashboard. */
export default function PartnerPage() {
  const { me } = useAuth();
  const isPartner = !!me?.partner;
  const overview = useAsync(() => api.get<PartnerOverview>('/partner/me'), [], isPartner);
  const [tab, setTab] = useState('overview');
  const [recharging, setRecharging] = useState(false);
  const o = overview.data;

  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, []);
  function change(k: string) {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell title={me?.partner?.name ?? 'Promotional partner'} subtitle="Promotional partner" wide>
      {me && !isPartner ? (
        <Alert kind="warning">
          This area is for brand partner accounts. <Link href="/partner/signup" className="font-semibold underline">Become a promotional partner</Link>
        </Alert>
      ) : overview.error ? (
        <Alert>{overview.error}</Alert>
      ) : !o ? (
        <SkeletonList />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white shadow-lg">
            <Mandala className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 text-white/15" />
            <div className="relative flex items-center gap-4 p-5">
              <PartnerLogo p={o.partner} className="h-16 w-16 shrink-0 rounded-2xl ring-2 ring-white/50" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Promotional partner</p>
                <h1 className="truncate text-2xl font-extrabold">{o.partner.name}</h1>
                <p className="truncate text-sm text-white/90">{o.partner.tagline ?? 'Your brand on festival passes'}</p>
              </div>
              <Badge value={o.partner.status}>
                {o.partner.status === 'ACTIVE' && <BadgeCheck aria-hidden className="h-3.5 w-3.5" />}
                {o.partner.status}
              </Badge>
            </div>
          </section>
          <PartnerStatusBanner partner={o.partner} />
          <SideTabsLayout tabs={TABS} active={tab} onChange={change}>
            {tab === 'overview' ? (
              <OverviewTab o={o} onRecharge={() => setRecharging(true)} onNew={() => change('new')} />
            ) : tab === 'new' ? (
              <NewCampaignTab o={o} onCreated={overview.reload} />
            ) : tab === 'campaigns' ? (
              <CampaignsTab o={o} onChanged={overview.reload} />
            ) : tab === 'wallet' ? (
              <WalletTab o={o} onChanged={overview.reload} />
            ) : (
              <ProfileTab key={o.partner.id} o={o} onSaved={overview.reload} />
            )}
          </SideTabsLayout>
          {recharging && <PartnerRechargeModal onClose={() => setRecharging(false)} onDone={() => { setRecharging(false); overview.reload(); }} />}
        </div>
      )}
    </AppShell>
  );
}
