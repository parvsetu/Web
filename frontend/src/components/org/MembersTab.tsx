'use client';

import { useState } from 'react';
import { api, asArray, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { Member, Paged } from '@/lib/types';
import { RoleSelect } from '../admin/VolunteersTab';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, SkeletonList } from '../ui';
import { TempPassword, useRoles } from './shared';
import { Pencil, Save, Trash2, UserPlus } from 'lucide-react';

export function MembersTab() {
  const org = useOrg();
  const { me } = useAuth();
  const list = useAsync(() => api.get<Member[] | Paged<Member>>(`/organizations/${org.orgId}/members`).then((r) => asArray(r)), [org.orgId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.name}'s org-wide role? Their festival assignments are not affected.`)) return;
    setError(null);
    try {
      await api.del(`/organizations/${org.orgId}/members/${m.userId}`);
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert kind="info">Members have an org-wide role that applies to every festival of this mandal. You can only give roles with permissions you have yourself.</Alert>
      {can(org.perms, 'USER_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}><UserPlus aria-hidden className="h-4 w-4" /> Add member</Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : (list.data ?? []).length === 0 ? (
        <Empty title="No members" />
      ) : (
        (list.data ?? []).map((m) => {
          const self = m.userId === me?.id;
          return (
            <Card key={m.userId} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{m.name}</span>
                  {self && <span className="text-xs text-slate-500">(you)</span>}
                  <Badge value={m.status} />
                </div>
                <div className="text-sm text-slate-600">
                  {m.role?.name} · {[m.mobile, m.email].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!self && (
                <div className="flex gap-2">
                  {can(org.perms, 'USER_UPDATE') && (
                    <Button variant="secondary" size="sm" onClick={() => setEditing(m)}>
                      <Pencil aria-hidden className="h-4 w-4" /> Edit
                    </Button>
                  )}
                  {can(org.perms, 'USER_DELETE') && (
                    <Button variant="ghost" size="sm" className="text-red-700" onClick={() => remove(m)}>
                      <Trash2 aria-hidden className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
      {adding && <AddMember onClose={() => setAdding(false)} onCreated={() => list.reload()} />}
      {editing && (
        <EditMember
          m={editing}
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

function AddMember({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const org = useOrg();
  const roles = useRoles(org.orgId);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', roleId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(Member & { temporaryPassword?: string }) | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Enter a name.');
    if (form.mobile.replace(/\D/g, '').length < 10) return setError('Enter a valid mobile number.');
    if (!form.roleId) return setError('Choose a role.');
    if (form.password && form.password.length < 8) return setError('Password must be at least 8 characters.');
    const body: Record<string, unknown> = { name: form.name.trim(), mobile: form.mobile.trim(), roleId: form.roleId };
    if (form.email.trim()) body.email = form.email.trim();
    if (form.password) body.password = form.password;
    setBusy(true);
    try {
      // API.md: POST returns the member and `temporaryPassword` once (exact envelope unspecified — accept both shapes).
      const res = await api.post<(Member & { temporaryPassword?: string }) | { member: Member; temporaryPassword?: string }>(
        `/organizations/${org.orgId}/members`,
        body,
      );
      const flat = 'member' in res ? { ...res.member, temporaryPassword: res.temporaryPassword } : res;
      setResult(flat);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add member">
      {result ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success">{result.name || form.name} added as {result.role?.name ?? 'member'}.</Alert>
          {result.temporaryPassword && <TempPassword password={result.temporaryPassword} who={result.name || form.name} />}
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LabeledInput label="Name" value={form.name} onChange={set('name')} />
          <LabeledInput label="Mobile" type="tel" inputMode="numeric" value={form.mobile} onChange={set('mobile')} hint="If this mobile already has an account, it is attached." />
          <LabeledInput label="Email (optional)" type="email" value={form.email} onChange={set('email')} />
          <LabeledInput label="Password (optional)" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} hint="Leave empty to generate a temporary password." />
          <RoleSelect roles={roles.data ?? []} value={form.roleId} onChange={(v) => setForm((x) => ({ ...x, roleId: v }))} />
          {roles.error && <Alert kind="warning">Could not load roles: {roles.error}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>
            <UserPlus aria-hidden className="h-4 w-4" /> Add member
          </Button>
        </form>
      )}
    </Modal>
  );
}

function EditMember({ m, onClose, onDone }: { m: Member; onClose: () => void; onDone: () => void }) {
  const org = useOrg();
  const roles = useRoles(org.orgId);
  const [roleId, setRoleId] = useState(m.role?.id ?? '');
  const [status, setStatus] = useState(m.status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (roleId && roleId !== m.role?.id) body.roleId = roleId;
    if (status !== m.status) body.status = status;
    if (Object.keys(body).length === 0) return onClose();
    if (reason.trim()) body.reason = reason.trim();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/organizations/${org.orgId}/members/${m.userId}`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Edit ${m.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RoleSelect roles={roles.data ?? []} value={roleId} onChange={setRoleId} />
        <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </LabeledSelect>
        <LabeledInput label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save
        </Button>
      </form>
    </Modal>
  );
}
