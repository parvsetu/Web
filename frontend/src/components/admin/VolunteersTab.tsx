'use client';

import { useState } from 'react';
import { api, asArray, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { Assignment, Paged, Role, Volunteer, VolunteerActivity } from '@/lib/types';
import { ScanRowCard } from '../ScanRow';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, SectionTitle, SkeletonList, Stat } from '../ui';

function assignmentUser(a: Assignment): { id: string; name: string; mobile?: string | null } {
  return {
    id: a.user?.id ?? a.userId ?? '',
    name: a.user?.name ?? a.name ?? 'Unknown',
    mobile: a.user?.mobile ?? a.mobile ?? null,
  };
}

export function useOrgRoles(orgId: string | undefined, enabled = true) {
  return useAsync(
    () => api.get<Role[] | Paged<Role>>(`/organizations/${orgId}/roles`).then((r) => asArray(r)),
    [orgId],
    !!orgId && enabled,
  );
}

export function VolunteersTab() {
  const ev = useEvent();
  const orgId = ev.organization?.id ?? ev.detail?.organizationId;
  const canAssign = can(ev.perms, 'VOLUNTEER_ASSIGN');
  const canDelete = can(ev.perms, 'VOLUNTEER_DELETE');
  const q = useAsync(
    () => api.get<Assignment[] | Paged<Assignment>>(`/events/${ev.eventId}/assignments`).then((r) => asArray(r)),
    [ev.eventId],
  );
  const roles = useOrgRoles(orgId, canAssign);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [activityFor, setActivityFor] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function remove(a: Assignment) {
    const u = assignmentUser(a);
    if (!window.confirm(`Remove ${u.name} from this festival?`)) return;
    setError(null);
    try {
      await api.del(`/events/${ev.eventId}/assignments/${a.id}`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const rows = (q.data ?? []).filter((a) => {
    if (!filter) return true;
    const u = assignmentUser(a);
    return `${u.name} ${u.mobile ?? ''} ${a.role?.name ?? ''}`.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <LabeledInput label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, mobile or role" />
        </div>
        {canAssign && <Button onClick={() => setAdding(true)}>Assign volunteer</Button>}
      </div>
      {error && <Alert>{error}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <Empty title="No volunteers assigned" />
      ) : (
        rows.map((a) => {
          const u = assignmentUser(a);
          return (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{u.name}</span>
                  <Badge value={a.status} />
                </div>
                <div className="text-sm text-slate-600">
                  {a.role?.name}
                  {u.mobile ? ` · ${u.mobile}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setActivityFor({ id: u.id, name: u.name })} disabled={!u.id}>
                  Activity
                </Button>
                {canAssign && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => remove(a)}>
                    Remove
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}

      {adding && orgId && (
        <AssignModal
          orgId={orgId}
          roles={roles.data ?? []}
          rolesError={roles.error}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            q.reload();
          }}
        />
      )}
      {editing && (
        <EditAssignmentModal
          assignment={editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            q.reload();
          }}
        />
      )}
      {activityFor && <ActivityModal user={activityFor} onClose={() => setActivityFor(null)} />}
    </div>
  );
}

function AssignModal({
  orgId,
  roles,
  rolesError,
  onClose,
  onDone,
}: {
  orgId: string;
  roles: Role[];
  rolesError: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ev = useEvent();
  const [search, setSearch] = useState('');
  const dSearch = useDebounced(search);
  const vols = useAsync(
    () => api.get<Volunteer[] | Paged<Volunteer>>(`/organizations/${orgId}/volunteers`, { q: dSearch || undefined }).then((r) => asArray(r)),
    [orgId, dSearch],
  );
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const volunteerRole = roles.find((r) => r.key === 'VOLUNTEER');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rid = roleId || volunteerRole?.id;
    if (!userId) return setError('Choose a person.');
    if (!rid) return setError('Choose a role.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${ev.eventId}/assignments`, { userId, roleId: rid });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Assign volunteer">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Search people in this mandal" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" />
        {vols.error && <Alert>{vols.error}</Alert>}
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
          {vols.loading ? (
            <SkeletonList rows={2} />
          ) : (vols.data ?? []).length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No people found. Create the volunteer from the Mandal admin first.</p>
          ) : (
            (vols.data ?? []).map((v) => {
              const already = v.assignments.some((a) => a.eventId === ev.eventId);
              return (
                <button
                  key={v.userId}
                  type="button"
                  onClick={() => setUserId(v.userId)}
                  disabled={already}
                  className={`flex min-h-[48px] items-center justify-between rounded-lg px-3 text-left ${
                    userId === v.userId ? 'bg-brand-100 ring-2 ring-brand-500' : 'hover:bg-slate-50'
                  } disabled:opacity-50`}
                >
                  <span>
                    <span className="font-semibold">{v.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{v.mobile}</span>
                  </span>
                  {already && <span className="text-xs">Already assigned</span>}
                </button>
              );
            })
          )}
        </div>
        <RoleSelect roles={roles} value={roleId || volunteerRole?.id || ''} onChange={setRoleId} />
        {rolesError && <Alert kind="warning">Could not load roles: {rolesError}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Assign
        </Button>
      </form>
    </Modal>
  );
}

export function RoleSelect({ roles, value, onChange, label = 'Role' }: { roles: Role[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <LabeledSelect label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Choose role —</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {r.isSystem ? '' : ' (custom)'}
        </option>
      ))}
    </LabeledSelect>
  );
}

function EditAssignmentModal({ assignment, roles, onClose, onDone }: { assignment: Assignment; roles: Role[]; onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const [roleId, setRoleId] = useState(assignment.role?.id ?? '');
  const [status, setStatus] = useState(assignment.status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (roleId && roleId !== assignment.role?.id) body.roleId = roleId;
    if (status !== assignment.status) body.status = status;
    if (Object.keys(body).length === 0) return onClose();
    if (reason.trim()) body.reason = reason.trim();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/events/${ev.eventId}/assignments/${assignment.id}`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${assignmentUser(assignment).name}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RoleSelect roles={roles} value={roleId} onChange={setRoleId} />
        <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </LabeledSelect>
        <LabeledInput label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </form>
    </Modal>
  );
}

function ActivityModal({ user, onClose }: { user: { id: string; name: string }; onClose: () => void }) {
  const ev = useEvent();
  const q = useAsync(() => api.get<VolunteerActivity>(`/events/${ev.eventId}/volunteers/${user.id}/activity`), [ev.eventId, user.id]);
  const s = q.data?.stats;
  return (
    <Modal open onClose={onClose} title={`${user.name} — activity`} wide>
      {q.loading ? (
        <SkeletonList rows={3} />
      ) : q.error ? (
        <Alert>{q.error}</Alert>
      ) : q.data ? (
        <div className="flex flex-col gap-3">
          {s && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Scans" value={fmtNum(s.total)} />
              <Stat label="Allowed" value={fmtNum(s.successful)} tone="green" />
              <Stat label="Duplicate" value={fmtNum(s.duplicate)} tone="red" />
              <Stat label="Failed" value={fmtNum(s.failed)} tone="amber" />
            </div>
          )}
          {s?.lastActiveAt && <p className="text-sm text-slate-600">Last active {fmtDateTime(s.lastActiveAt, ev.timezone)}</p>}
          <SectionTitle>Recent scans</SectionTitle>
          {q.data.recentScans.length === 0 ? (
            <Empty title="No scans yet" />
          ) : (
            q.data.recentScans.map((r) => <ScanRowCard key={r.id} row={r} tz={ev.timezone} />)
          )}
        </div>
      ) : null}
    </Modal>
  );
}
