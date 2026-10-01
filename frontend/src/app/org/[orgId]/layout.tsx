'use client';

import { OrgProvider } from '@/lib/org-context';

export default function OrgLayout({ children, params }: { children: React.ReactNode; params: { orgId: string } }) {
  return <OrgProvider orgId={params.orgId}>{children}</OrgProvider>;
}
