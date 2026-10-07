'use client';

import { StateCityPicker } from '@/components/PlacePicker';
import { SearchBar } from '@/components/SearchBar';
import { usePagedList } from '@/lib/paged';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, asArray, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import type { Organization, Paged, PlatformUser } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SideTabsLayout, SkeletonList, Textarea } from '@/components/ui';
import { BillingAdmin } from '@/components/platform/BillingAdmin';
import { PayoutsAdmin } from '@/components/platform/PayoutsAdmin';
import { PartnersAdmin } from '@/components/platform/PartnersAdmin';
import { RegistrationsAdmin } from '@/components/platform/RegistrationsAdmin';
import { EventReviewsAdmin } from '@/components/platform/EventReviewsAdmin';
import { ReportedReviewsAdmin } from '@/components/platform/ReportedReviewsAdmin';
import { AgentsAdmin } from '@/components/platform/AgentsAdmin';
import { EventFeesAdmin } from '@/components/platform/EventFeesAdmin';
import { FestivalChooser } from '@/components/org/OrgSettingsTab';
import type { AgentInfo } from '@/lib/registration-types';
import { BadgeIndianRupee, BriefcaseBusiness, ClipboardCheck, Flag, Ticket, Users as Users2, Wallet } from 'lucide-react';
import { Building2, CalendarDays, Handshake, Landmark, Plus } from 'lucide-react';

export default function PlatformPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState('registrations');
  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (h) setTab(h);
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
    <AppShell title="Platform admin" subtitle="Super admin" back="/dashboard" wide>
      {me && !me.isSuperAdmin ? (
        <Alert kind="warning">Only platform super admins can open this page.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <SideTabsLayout
            tabs={[
              { key: 'registrations', label: 'Registrations', icon: ClipboardCheck },
              { key: 'reviews', label: 'Event reviews', icon: Ticket },
              { key: 'reported', label: 'Reported visitor reviews', icon: Flag },
              { key: 'agents', label: 'Agents', icon: BriefcaseBusiness },
              { key: 'fees', label: 'Event fees', icon: BadgeIndianRupee },
              { key: 'billing', label: 'Billing & earnings', icon: Wallet },
              { key: 'payouts', label: 'Payouts & KYC', icon: Landmark },
              { key: 'partners', label: 'Promotional partners', icon: Handshake },
              { key: 'orgs', label: 'Mandals', icon: Building2 },
              { key: 'users', label: 'Users', icon: Users2 },
            ]}
            active={tab}
            onChange={change}
          >
            {tab === 'registrations' ? <RegistrationsAdmin /> : tab === 'reviews' ? <EventReviewsAdmin /> : tab === 'reported' ? <ReportedReviewsAdmin /> : tab === 'agents' ? <AgentsAdmin /> : tab === 'fees' ? <EventFeesAdmin /> : tab === 'billing' ? <BillingAdmin /> : tab === 'payouts' ? <PayoutsAdmin /> : tab === 'partners' ? <PartnersAdmin /> : tab === 'orgs' ? <Orgs /> : <Users />}
          </SideTabsLayout>
        </div>
      )}
    </AppShell>
  );
}

function Orgs() {
  const q = usePagedList<Organization>('/organizations', {}, { pageSize: 20 });
  const [creating, setCreating] = useState(false);
  const [crediting, setCrediting] = useState<Organization | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Building2 aria-hidden className="h-4 w-4" /> New organisation</Button>
      </div>
      <p className="text-xs text-slate-500">Mandals can also register themselves or through a field agent — see Registrations. Mandals you create here are verified; their festivals still go through review and the per-event fee.</p>
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search mandal name or city" total={q.total} />
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        <Empty title={q.searching ? 'No mandals match your search' : 'No organisations yet'} />
      ) : (
        q.items.map((o) => (
          <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="break-words font-bold">{o.name}</div>
              <div className="text-sm text-slate-600">{[o.city, o.state, o.slug].filter(Boolean).join(' · ')}</div>
              {o.agent && (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  <BriefcaseBusiness aria-hidden className="h-3.5 w-3.5" /> {o.registration?.source === 'AGENT' ? 'Registered via' : 'Agent'} {o.agent.name} ({o.agent.code})
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setCrediting(o)}>
                <BriefcaseBusiness aria-hidden className="h-4 w-4" /> Agent
              </Button>
              <Link href={`/org/${o.id}`} className="inline-flex min-h-[40px] items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
                Manage
              </Link>
            </div>
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {crediting && <CreditAgent org={crediting} onClose={() => setCrediting(null)} onDone={() => { setCrediting(null); q.reload(); }} />}
      {creating && (
        <CreateOrg
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            q.reload();
          }}
        />
      )}
    </div>
  );
}

/** Credit a mandal to a field agent (audited); its future paid festival fees earn for the agent. */
function CreditAgent({ org, onClose, onDone }: { org: Organization; onClose: () => void; onDone: () => void }) {
  const agents = useAsync(() => api.get<Paged<AgentInfo>>('/platform/agents', { pageSize: 200 }), []);
  const [agentId, setAgentId] = useState(org.agent?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Agent for ${org.name}`}>
      <div className="flex flex-col gap-4">
        <LabeledSelect label="Field agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">— No agent —</option>
          {(agents.data?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code}){a.status !== 'ACTIVE' ? ' · suspended' : ''}</option>)}
        </LabeledSelect>
        <LabeledInput label="Reason (audited)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Visited by Rakesh in August" />
        <p className="text-xs text-slate-500">Only festival fees paid from now on earn for the agent.</p>
        {error && <Alert>{error}</Alert>}
        <Button loading={busy} disabled={reason.trim().length < 3} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post(`/platform/organizations/${org.id}/agent`, { agentId: agentId || null, reason: reason.trim() });
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

function CreateOrg({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const agents = useAsync(() => api.get<Paged<AgentInfo>>('/platform/agents', { pageSize: 200, status: 'ACTIVE' }), []);
  const [festivals, setFestivals] = useState<string[]>([]);
  const [agentId, setAgentId] = useState('');
  const [form, setForm] = useState({ name: '', state: '', city: '', address: '', slug: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Enter a name.');
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) return setError('Slug may contain lowercase letters, digits and hyphens only.');
    const body: Record<string, string | string[]> = { name: form.name.trim(), festivalTypes: festivals };
    if (agentId) body.agentId = agentId;
    if (form.state) body.state = form.state;
    if (form.city.trim()) body.city = form.city.trim();
    if (form.address.trim()) body.address = form.address.trim();
    if (form.slug.trim()) body.slug = form.slug.trim();
    setBusy(true);
    setError(null);
    try {
      await api.post('/organizations', body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="New organisation" wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Name" value={form.name} onChange={set('name')} />
        <StateCityPicker state={form.state} city={form.city} onChange={(p) => setForm((x) => ({ ...x, ...p }))} />
        <Field label="Address (optional)">
          <Textarea value={form.address} onChange={set('address')} />
        </Field>
        <LabeledInput label="Slug (optional)" value={form.slug} onChange={set('slug')} hint="Lowercase, e.g. lalbaug-mandal" />
        <FestivalChooser value={festivals} onChange={setFestivals} />
        <LabeledSelect label="Registered by field agent (optional)" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">— None —</option>
          {(agents.data?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
        </LabeledSelect>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Create
        </Button>
      </form>
    </Modal>
  );
}

function Users() {
  const { me } = useAuth();
  const [qText, setQText] = useState('');
  const q = useDebounced(qText);
  const [page, setPage] = useState(1);
  const [orgId, setOrgId] = useState('');
  const [kind, setKind] = useState('');
  const orgs = useAsync(() => api.get<Paged<Organization>>('/organizations', { pageSize: 200 }), []);
  const list = useAsync(
    () => api.get<Paged<PlatformUser>>('/users', { q, page, organizationId: orgId || undefined, kind: kind || undefined }),
    [q, page, orgId, kind],
  );
  const [error, setError] = useState<string | null>(null);

  async function setStatus(u: PlatformUser, status: 'ACTIVE' | 'DISABLED') {
    const reason = window.prompt(`${status === 'DISABLED' ? 'Disable' : 'Enable'} ${u.name}? Optional reason:`, '');
    if (reason === null) return;
    setError(null);
    try {
      await api.patch(`/users/${u.id}`, { status, reason: reason.trim() || undefined });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <LabeledInput
        label="Search users"
        value={qText}
        onChange={(e) => {
          setQText(e.target.value);
          setPage(1);
        }}
        placeholder="Name, mobile or email"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledSelect
          label="Mandal"
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All mandals</option>
          {(orgs.data?.items ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.city ? ` · ${o.city}` : ''}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect
          label="Type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Everyone</option>
          <option value="MANDAL_MEMBER">Mandal members (admins, treasurers…)</option>
          <option value="VOLUNTEER">Festival volunteers only</option>
          <option value="PARTNER">Promotional partners</option>
          <option value="AGENT">Field agents</option>
          <option value="SUPER_ADMIN">Super admins</option>
          <option value="NO_ACCESS">No access yet</option>
        </LabeledSelect>
      </div>
      {list.data && <p className="text-sm text-slate-500">{list.data.total} user{list.data.total === 1 ? '' : 's'}</p>}
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.data && list.data.items.length > 0 ? (
        <>
          {list.data.items.map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{u.name}</span>
                  <Badge value={u.status} />
                  {u.isSuperAdmin && <Badge className="bg-slate-900 text-white">Super admin</Badge>}
                </div>
                <div className="text-sm text-slate-600">{[u.mobile, u.email].filter(Boolean).join(' · ')}</div>
                <div className="text-xs text-slate-500">Joined {fmtDateTime(u.createdAt)}</div>
                <UserAccess u={u} />
              </div>
              {u.id !== me?.id &&
                (u.status === 'DISABLED' ? (
                  <Button variant="secondary" size="sm" onClick={() => setStatus(u, 'ACTIVE')}>
                    Enable
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setStatus(u, 'DISABLED')}>
                    Disable
                  </Button>
                ))}
            </Card>
          ))}
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </>
      ) : (
        <Empty title="No users found" />
      )}
    </div>
  );
}

/** Where the user belongs: mandal roles, festival assignments, partner brand. */
function UserAccess({ u }: { u: PlatformUser }) {
  const members = u.memberships ?? [];
  // Festival roles grouped under their mandal.
  const byOrg = new Map<string, { name: string; items: NonNullable<PlatformUser['assignments']> }>();
  for (const a of u.assignments ?? []) {
    const g = byOrg.get(a.event.organization.id) ?? { name: a.event.organization.name, items: [] };
    g.items.push(a);
    byOrg.set(a.event.organization.id, g);
  }
  if (!members.length && !byOrg.size && !u.partner && !u.agent && !u.isSuperAdmin) {
    return <p className="mt-2 text-xs font-medium text-amber-700">No mandal or festival access</p>;
  }
  const inactive = (s: string) => s !== 'ACTIVE';
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {u.agent && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <BriefcaseBusiness aria-hidden className="h-3.5 w-3.5" /> Field agent · {u.agent.code} ({u.agent.status.toLowerCase()})
        </span>
      )}
      {u.partner && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-200">
          <Handshake aria-hidden className="h-3.5 w-3.5" /> Partner · {u.partner.name} ({u.partner.status.toLowerCase()})
        </span>
      )}
      {members.map((m) => (
        <span
          key={m.organization.id}
          className={`inline-flex w-fit flex-wrap items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${inactive(m.status) ? 'bg-slate-50 text-slate-500 ring-slate-200 line-through' : 'bg-orange-50 text-orange-900 ring-orange-200'}`}
        >
          <Building2 aria-hidden className="h-3.5 w-3.5" />
          <span className="font-semibold">{m.organization.name}</span>
          <span>· {m.role.name}</span>
          {inactive(m.status) && <span className="no-underline">({m.status.toLowerCase()})</span>}
        </span>
      ))}
      {[...byOrg.entries()].map(([id, g]) => (
        <div key={id} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-600">{g.name}:</span>
          {g.items.map((a) => (
            <span
              key={a.event.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${inactive(a.status) ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-sky-50 text-sky-900 ring-sky-200'}`}
            >
              <CalendarDays aria-hidden className="h-3 w-3" /> {a.event.name} · {a.role.name}
              {inactive(a.status) ? ' (inactive)' : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
