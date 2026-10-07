// UI-only permission helpers. These HIDE controls; the server is the authority
// and re-checks every request.

import type { MeUser, Permission } from './types';

export function can(perms: readonly string[] | null | undefined, perm: Permission): boolean {
  return !!perms && perms.includes(perm);
}

export function canAny(perms: readonly string[] | null | undefined, list: readonly Permission[]): boolean {
  return !!perms && list.some((p) => perms.includes(p));
}

/** Effective permissions for an event: the per-event list from /auth/me. Super admins get all. */
export function eventPerms(me: MeUser | null, eventId: string): string[] {
  if (!me) return [];
  if (me.isSuperAdmin) return ALL_PERMISSIONS;
  return me.events.find((e) => e.id === eventId)?.permissions ?? [];
}

export function orgPerms(me: MeUser | null, orgId: string): string[] {
  if (!me) return [];
  if (me.isSuperAdmin) return ALL_PERMISSIONS;
  return me.organizations.find((o) => o.id === orgId)?.permissions ?? [];
}

/** Permissions that mean "this person manages the event" (vs. a gate volunteer). */
export const EVENT_ADMIN_PERMS: Permission[] = [
  'REPORT_VIEW',
  'TOKEN_VIEW',
  'VOLUNTEER_VIEW',
  'DONATION_VIEW',
  'EXPENSE_VIEW',
  'SETTINGS_UPDATE',
  'EVENT_UPDATE',
];

export const ORG_ADMIN_PERMS: Permission[] = [
  'EVENT_CREATE',
  'VOLUNTEER_VIEW',
  'USER_VIEW',
  'ROLE_VIEW',
  'AUDIT_VIEW',
  'REPORT_VIEW',
  'SETTINGS_UPDATE',
];

export const ALL_PERMISSIONS: Permission[] = [
  'USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'VOLUNTEER_VIEW', 'VOLUNTEER_CREATE', 'VOLUNTEER_UPDATE', 'VOLUNTEER_DELETE', 'VOLUNTEER_ASSIGN',
  'EVENT_VIEW', 'EVENT_CREATE', 'EVENT_UPDATE', 'EVENT_DELETE',
  'TOKEN_VIEW', 'TOKEN_CREATE', 'TOKEN_GENERATE', 'TOKEN_SCAN', 'TOKEN_MANUAL_ENTRY', 'TOKEN_CANCEL', 'TOKEN_REACTIVATE',
  'DONATION_VIEW', 'DONATION_CREATE', 'DONATION_UPDATE',
  'EXPENSE_VIEW', 'EXPENSE_CREATE', 'EXPENSE_UPDATE',
  'REPORT_VIEW', 'REPORT_EXPORT',
  'ROLE_VIEW', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE',
  'SETTINGS_VIEW', 'SETTINGS_UPDATE',
  'AUDIT_VIEW',
  'GALLERY_VIEW', 'GALLERY_MANAGE',
  'REVIEW_VIEW', 'REVIEW_MANAGE',
  'STALL_VIEW', 'STALL_MANAGE',
];
