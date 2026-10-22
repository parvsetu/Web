'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

type Props = { eventId: string; className: string; children: ReactNode; /** Preselect this day (YYYY-MM-DD) in booking. */ date?: string; /** Preselect this programme's ticket. */ item?: string };

/** A blogger's referral link (/f/<id>?ref=CODE) carries the code on into booking. */
function bookHref(eventId: string, ref: string | null, date?: string, item?: string) {
  const q = new URLSearchParams();
  const code = (ref ?? '').trim();
  if (/^[A-Za-z0-9]{4,20}$/.test(code)) q.set('ref', code.toUpperCase());
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) q.set('date', date);
  if (item) q.set('item', item);
  const s = q.toString();
  return `/book/${eventId}${s ? `?${s}` : ''}`;
}

function WithRef({ eventId, className, children, date, item }: Props) {
  const ref = useSearchParams().get('ref');
  return <Link href={bookHref(eventId, ref, date, item)} className={className}>{children}</Link>;
}

/**
 * The festival page is cached, so it can't read ?ref= on the server — the
 * link picks it up in the browser. Server HTML has the plain link.
 */
export function BookLink(props: Props) {
  return (
    <Suspense fallback={<Link href={bookHref(props.eventId, null, props.date, props.item)} className={props.className}>{props.children}</Link>}>
      <WithRef {...props} />
    </Suspense>
  );
}
