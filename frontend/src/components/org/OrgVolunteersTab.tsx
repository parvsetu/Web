'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { usePagedList } from '@/lib/paged';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { Volunteer } from '@/lib/types';
import { RoleSelect } from '../admin/VolunteersTab';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SkeletonList } from '../ui';
import { TempPassword, useOrgEvents, useRoles } from './shared';
import { Pencil, Save, UserCheck, UserPlus, UserX } from 'lucide-react';

export function OrgVolunteersTab() {
  const org = useOrg();
  const [f, setF] = useState({ eventId: '', status: '' });
  const list = usePagedList<Volunteer>(`/organizations/${org.orgId}/volunteers`, { eventId: f.eventId || undefined, status: f.status || undefined });
  const events = useOrgEvents(org.orgId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = can(org.perms, 'VOLUNTEER_UPDATE');

  async function toggle(v: Volunteer, activate: boolean) {
    const reason = window.prompt(activate ? `Activate ${v.name}? Optional reason:` : `Deactivate ${v.name} for all festivals of this mandal? Optional reason:`, '');
    if (reason === null) return;
    setError(null);
    try {
      await api.post(`/organizations/${org.orgId}/volunteers/${v.userId}/${activate ? 'activate' : 'deactivate'}`, reason.trim() ? { reason: reason.trim() } : {});
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <LabeledInput label="Search" type="search" value={list.search} onChange={(e) => list.setSearch(e.target.value)} placeholder="Name, mobile or email" />
        </div>
        <LabeledSelect label="Festival" value={f.eventId} onChange={(e) => setF((x) => ({ ...x, eventId: e.target.value }))}>
          <option value="">All</option>
          {(events.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Status" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </LabeledSelect>
      </Card>
      {can(org.perms, 'VOLUNTEER_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}><UserPlus aria-hidden className="h-4 w-4" /> Add volunteer</Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty title="No volunteers found" />
      ) : (
        list.items.map((v) => {
          const anyActive = v.assignments.some((a) => a.status === 'ACTIVE');
          return (
            <Card key={v.userId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{v.name}</span>
                    <Badge value={v.accountStatus} />
                  </div>
                  <div className="text-sm text-slate-600">{[v.mobile, v.email].filter(Boolean).join(' · ')}</div>
                </div>
                {canUpdate && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(v)}>
                      <Pencil aria-hidden className="h-4 w-4" /> Edit
                    </Button>
                    {anyActive ? (
                      <Button variant="ghost" size="sm" className="text-red-700" onClick={() => toggle(v, false)}>
                        <UserX aria-hidden className="h-4 w-4" /> Deactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-green-700" onClick={() => toggle(v, true)}>
                        <UserCheck aria-hidden className="h-4 w-4" /> Activate
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {v.assignments.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {v.assignments.map((a) => (
                    <li key={a.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                      {a.eventName} · {a.role.name} · <span className={a.status === 'ACTIVE' ? 'text-green-700' : 'text-slate-500'}>{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      {creating && (
        <CreateVolunteer
          onClose={() => setCreating(false)}
          onCreated={() => list.reload()}
        />
      )}
      {editing && (
        <EditVolunteer
          v={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function CreateVolunteer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const org = useOrg();
  const events = useOrgEvents(org.orgId);
  const roles = useRoles(org.orgId, can(org.perms, 'ROLE_VIEW'));
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', eventId: '', roleId: '', status: 'ACTIVE' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ volunteer: Volunteer; temporaryPassword?: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Enter a name.');
    if (form.mobile.replace(/\D/g, '').length < 10) return setError('Enter a valid mobile number.');
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a valid email or leave it empty.');
    if (form.password && form.password.length < 8) return setError('Password must be at least 8 characters, or leave empty to generate one.');
    if (!form.eventId) return setError('Choose a festival.');
    const body: Record<string, unknown> = { name: form.name.trim(), mobile: form.mobile.trim(), eventId: form.eventId, status: form.status };
    if (form.email.trim()) body.email = form.email.trim();
    if (form.password) body.password = form.password;
    if (form.roleId) body.roleId = form.roleId;
    setBusy(true);
    try {
      const res = await api.post<{ volunteer: Volunteer; temporaryPassword?: string }>(`/organizations/${org.orgId}/volunteers`, body);
      setResult(res);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add volunteer">
      {result ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success">{result.volunteer.name} has been added.</Alert>
          {result.temporaryPassword ? (
            <TempPassword password={result.temporaryPassword} who={result.volunteer.name} />
          ) : (
            <p className="text-sm text-slate-600">They can log in with their existing password (or the one you set).</p>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LabeledInput label="Name" value={form.name} onChange={set('name')} />
          <LabeledInput label="Mobile" type="tel" inputMode="numeric" value={form.mobile} onChange={set('mobile')} />
          <LabeledInput label="Email (optional)" type="email" value={form.email} onChange={set('email')} />
          <LabeledInput
            label="Password (optional)"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            hint="Leave empty and a temporary password will be generated."
          />
          <LabeledSelect label="Festival" value={form.eventId} onChange={set('eventId')}>
            <option value="">— Choose —</option>
            {(events.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </LabeledSelect>
          <RoleSelect roles={roles.data ?? []} value={form.roleId} onChange={(v) => setForm((x) => ({ ...x, roleId: v }))} label="Role (default: Volunteer)" />
          <LabeledSelect label="Status" value={form.status} onChange={set('status')}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </LabeledSelect>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>
            <UserPlus aria-hidden className="h-4 w-4" /> Add volunteer
          </Button>
        </form>
      )}
    </Modal>
  );
}

function EditVolunteer({ v, onClose, onDone }: { v: Volunteer; onClose: () => void; onDone: () => void }) {
  const org = useOrg();
  const [name, setName] = useState(v.name);
  const [email, setEmail] = useState(v.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name.');
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/organizations/${org.orgId}/volunteers/${v.userId}`, { name: name.trim(), email: email.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Edit ${v.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <LabeledInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="text-xs text-slate-500">Mobile number: {v.mobile ?? '—'} (cannot be changed here)</p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save
        </Button>
      </form>
    </Modal>
  );
}
