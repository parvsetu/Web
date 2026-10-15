'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

type Props = { eventId: string; className: string; children: ReactNode };

/** A blogger's referral link (/f/<id>?ref=CODE) carries the code on into booking. */
function refQuery(ref: string | null) {
  const code = (ref ?? '').trim();
  return /^[A-Za-z0-9]{4,20}$/.test(code) ? `?ref=${encodeURIComponent(code.toUpperCase())}` : '';
}

function WithRef({ eventId, className, children }: Props) {
  const ref = useSearchParams().get('ref');
  return <Link href={`/book/${eventId}${refQuery(ref)}`} className={className}>{children}</Link>;
}

/**
 * The festival page is cached, so it can't read ?ref= on the server — the
 * link picks it up in the browser. Server HTML has the plain link.
 */
export function BookLink(props: Props) {
  return (
    <Suspense fallback={<Link href={`/book/${props.eventId}`} className={props.className}>{props.children}</Link>}>
      <WithRef {...props} />
    </Suspense>
  );
}
