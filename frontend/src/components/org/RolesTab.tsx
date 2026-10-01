'use client';

import { useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { PermissionDef, Role } from '@/lib/types';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, Modal, SkeletonList, Textarea } from '../ui';
import { useRoles } from './shared';
import { Pencil } from 'lucide-react';

export function RolesTab() {
  const org = useOrg();
  const roles = useRoles(org.orgId);
  const perms = useAsync(() => api.get<PermissionDef[]>('/permissions'), []);
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [viewing, setViewing] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(r: Role) {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    setError(null);
    try {
      await api.del(`/organizations/${org.orgId}/roles/${r.id}`);
      roles.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const sorted = [...(roles.data ?? [])].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-3">
      {can(org.perms, 'ROLE_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>New custom role</Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {roles.error && <Alert>{roles.error}</Alert>}
      {roles.loading && !roles.data ? (
        <SkeletonList />
      ) : sorted.length === 0 ? (
        <Empty title="No roles" />
      ) : (
        sorted.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{r.name}</span>
                {r.isSystem ? <Badge className="bg-slate-900 text-white">System</Badge> : <Badge className="bg-brand-100 text-brand-800">Custom</Badge>}
              </div>
              {r.description && <div className="text-sm text-slate-600">{r.description}</div>}
              <div className="text-xs text-slate-500">
                {r.permissions.length} permissions · {r.memberCount} members · {r.assignmentCount} festival assignments
              </div>
            </div>
            <div className="flex gap-2">
              {r.isSystem || !can(org.perms, 'ROLE_UPDATE') ? (
                <Button variant="secondary" size="sm" onClick={() => setViewing(r)}>
                  View
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                  <Pencil aria-hidden className="h-4 w-4" /> Edit
                </Button>
              )}
              {!r.isSystem && can(org.perms, 'ROLE_DELETE') && (
                <Button variant="ghost" size="sm" className="text-red-700" onClick={() => remove(r)}>
                  Delete
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
      {editing && (
        <RoleForm
          role={editing === 'new' ? null : editing}
          defs={perms.data ?? []}
          defsError={perms.error}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            roles.reload();
          }}
        />
      )}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.name}>
          {viewing.isSystem && <Alert kind="info">System roles are built in and cannot be edited.</Alert>}
          <PermissionGrid defs={perms.data ?? []} selected={new Set(viewing.permissions)} readOnly onToggle={() => undefined} />
        </Modal>
      )}
    </div>
  );
}

function PermissionGrid({
  defs,
  selected,
  readOnly,
  onToggle,
}: {
  defs: PermissionDef[];
  selected: Set<string>;
  readOnly?: boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const d of defs) {
      const g = d.group || 'Other';
      m.set(g, [...(m.get(g) ?? []), d]);
    }
    return [...m.entries()];
  }, [defs]);
  return (
    <div className="mt-3 flex flex-col gap-3">
      {groups.map(([group, items]) => (
        <fieldset key={group} className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-bold">{humanize(group)}</legend>
          {items.map((d) => (
            <Checkbox
              key={d.key}
              checked={selected.has(d.key)}
              disabled={readOnly}
              onChange={(v) => onToggle(d.key, v)}
              label={
                <span>
                  <span className="font-mono text-xs font-semibold">{d.key}</span>
                  <span className="block text-sm text-slate-600">{d.description}</span>
                </span>
              }
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function RoleForm({
  role,
  defs,
  defsError,
  onClose,
  onDone,
}: {
  role: Role | null;
  defs: PermissionDef[];
  defsError: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const org = useOrg();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a role name.');
    if (selected.size === 0) return setError('Pick at least one permission.');
    const body = { name: name.trim(), description: description.trim() || undefined, permissions: [...selected] };
    setBusy(true);
    setError(null);
    try {
      if (role) await api.patch(`/organizations/${org.orgId}/roles/${role.id}`, body);
      else await api.post(`/organizations/${org.orgId}/roles`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={role ? `Edit ${role.name}` : 'New custom role'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Description (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Alert kind="warning">
          Be careful with TOKEN_MANUAL_ENTRY (codes are guessable) and TOKEN_REACTIVATE (undoes an entry). You cannot grant permissions you don’t have.
        </Alert>
        {defsError && <Alert>{defsError}</Alert>}
        <PermissionGrid
          defs={defs}
          selected={selected}
          onToggle={(k, on) =>
            setSelected((s) => {
              const n = new Set(s);
              if (on) n.add(k);
              else n.delete(k);
              return n;
            })
          }
        />
        {error && <Alert>{error}</Alert>}
        <div className="sticky bottom-0 bg-white pb-1 pt-2">
          <Button type="submit" loading={busy} className="w-full">
            Save role ({selected.size} permissions)
          </Button>
        </div>
      </form>
    </Modal>
  );
}
