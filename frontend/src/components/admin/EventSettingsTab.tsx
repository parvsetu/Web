'use client';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEvent } from '@/lib/event-context';
import type { EventDetail } from '@/lib/types';
import { EventForm } from '../EventForm';
import { Alert, Card, SkeletonList } from '../ui';

export function EventSettingsTab() {
  const ev = useEvent();
  const { refresh } = useAuth();
  if (!ev.detail) return ev.loading ? <SkeletonList /> : <Alert>Could not load festival settings.</Alert>;
  return (
    <Card>
      <EventForm
        key={ev.detail.id}
        initial={ev.detail}
        festivalTypes={ev.detail.organization?.festivalTypes}
        submitLabel="Save settings"
        onSubmit={async (body) => {
          await api.patch<EventDetail>(`/events/${ev.eventId}`, body);
          ev.reloadDetail();
          void refresh();
        }}
      />
    </Card>
  );
}
