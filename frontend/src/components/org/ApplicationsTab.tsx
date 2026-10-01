'use client';

import { useState } from 'react';
import { api, asArray, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { Application, Paged } from '@/lib/types';
import { RoleSelect } from '../admin/VolunteersTab';
import { Alert, Badge, Button, Card, Empty, Field, LabeledSelect, Modal, SkeletonList, Textarea } from '../ui';
import { useOrgEvents, useRoles } from './shared';
import { Check, X } from 'lucide-react';

export function ApplicationsTab() {
  const org = useOrg();
  const [status, setStatus] = useState('PENDING');
  const list = useAsync(
    () =>
      api
        .get<Application[] | Paged<Application>>(`/organizations/${org.orgId}/volunteer-applications`, { status })
        .then((r) => asArray(r)),
    [org.orgId, status],
  );
  const [approving, setApproving] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState<Application | null>(null);
  const canAssign = can(org.perms, 'VOLUNTEER_ASSIGN');

  return (
    <div className="flex flex-col gap-3">
      <div className="sm:max-w-xs">
        <LabeledSelect label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </LabeledSelect>
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : (list.data ?? []).length === 0 ? (
        <Empty title={status === 'PENDING' ? 'No pending applications' : 'Nothing here'} />
      ) : (
        (list.data ?? []).map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{a.user?.name ?? 'Applicant'}</span>
                  <Badge value={a.status} />
                </div>
                <div className="text-sm text-slate-600">{[a.user?.mobile, a.user?.email].filter(Boolean).join(' · ')}</div>
                <div className="text-xs text-slate-500">
                  {a.event ? `For ${a.event.name} · ` : ''}
                  {fmtDateTime(a.createdAt)}
                </div>
                {a.message && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">“{a.message}”</p>}
                {a.reviewNote && <p className="mt-1 text-xs text-slate-500">Note: {a.reviewNote}</p>}
              </div>
              {a.status === 'PENDING' && canAssign && (
                <div className="flex gap-2">
                  <Button variant="success" size="sm" onClick={() => setApproving(a)}>
                    <Check aria-hidden className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setRejecting(a)}>
                    <X aria-hidden className="h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))
      )}
      {approving && (
        <ApproveModal
          app={approving}
          onClose={() => setApproving(null)}
          onDone={() => {
            setApproving(null);
            list.reload();
          }}
        />
      )}
      {rejecting && (
        <RejectModal
          app={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function ApproveModal({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const org = useOrg();
  const events = useOrgEvents(org.orgId);
  const roles = useRoles(org.orgId);
  const [eventId, setEventId] = useState(app.event?.id ?? '');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaultRole = (roles.data ?? []).find((r) => r.key === 'VOLUNTEER');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rid = roleId || defaultRole?.id;
    if (!eventId) return setError('Choose a festival.');
    if (!rid) return setError('Choose a role.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/organizations/${org.orgId}/volunteer-applications/${app.id}/approve`, { eventId, roleId: rid });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Approve ${app.user?.name ?? 'applicant'}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledSelect label="Festival" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">— Choose —</option>
          {(events.data ?? []).map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </LabeledSelect>
        <RoleSelect roles={roles.data ?? []} value={roleId || defaultRole?.id || ''} onChange={setRoleId} />
        {roles.error && <Alert kind="warning">Could not load roles: {roles.error}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="success" loading={busy}>
          <Check aria-hidden className="h-4 w-4" /> Approve
        </Button>
      </form>
    </Modal>
  );
}

function RejectModal({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const org = useOrg();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/organizations/${org.orgId}/volunteer-applications/${app.id}/reject`, reason.trim() ? { reason: reason.trim() } : {});
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Reject ${app.user?.name ?? 'applicant'}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Reason (shown to the applicant, optional)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" loading={busy}>
          <X aria-hidden className="h-4 w-4" /> Reject
        </Button>
      </form>
    </Modal>
  );
}
