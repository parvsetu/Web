'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org-context';
import { Alert, Button, Card, Field, LabeledInput, SkeletonList, Textarea } from '../ui';

export function OrgSettingsTab() {
  const org = useOrg();
  if (!org.org) return org.loading ? <SkeletonList rows={2} /> : <Alert>Could not load mandal details.</Alert>;
  return <Form key={org.org.id} />;
}

function Form() {
  const org = useOrg();
  const { refresh } = useAuth();
  const [name, setName] = useState(org.org?.name ?? '');
  const [city, setCity] = useState(org.org?.city ?? '');
  const [address, setAddress] = useState(org.org?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setOk(false);
    if (!name.trim()) return setError('Enter the mandal name.');
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/organizations/${org.orgId}`, { name: name.trim(), city: city.trim() || undefined, address: address.trim() || undefined });
      setOk(true);
      org.reload();
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Mandal name" value={name} onChange={(e) => setName(e.target.value)} />
        <LabeledInput label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Field label="Address (printed on receipts)">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">Saved.</Alert>}
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </form>
    </Card>
  );
}
