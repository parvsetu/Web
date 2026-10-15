'use client';

import { EventProvider } from '@/lib/event-context';

export default function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  return <EventProvider eventId={params.eventId}>{children}</EventProvider>;
}
