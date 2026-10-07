// Single source of truth for the permission catalog and the seeded system
// roles. The seed mirrors this into the `permissions` / `roles` tables;
// authorization always reads the DB (so custom org roles work the same way).

export const PERMISSIONS = {
  USER_VIEW: 'View organization members',
  USER_CREATE: 'Add organization members',
  USER_UPDATE: 'Change member roles / status',
  USER_DELETE: 'Remove organization members',

  VOLUNTEER_VIEW: 'View volunteers and applications',
  VOLUNTEER_CREATE: 'Create volunteers',
  VOLUNTEER_UPDATE: 'Edit / activate / deactivate volunteers',
  VOLUNTEER_DELETE: 'Remove volunteers from events',
  VOLUNTEER_ASSIGN: 'Assign volunteers to events, approve applications',

  EVENT_VIEW: 'View event information',
  EVENT_CREATE: 'Create events',
  EVENT_UPDATE: 'Edit events',
  EVENT_DELETE: 'Delete draft events',

  TOKEN_VIEW: 'View tokens',
  TOKEN_CREATE: 'Issue a token at the desk',
  TOKEN_GENERATE: 'Bulk-generate tokens and change token validity',
  TOKEN_SCAN: 'Scan / verify tokens at the gate',
  TOKEN_MANUAL_ENTRY: 'Verify a token by typing its printed code',
  TOKEN_CANCEL: 'Cancel tokens',
  TOKEN_REACTIVATE: 'Administrative recovery of a used token',

  DONATION_VIEW: 'View donations',
  DONATION_CREATE: 'Record donations',
  DONATION_UPDATE: 'Update donation payment status',

  EXPENSE_VIEW: 'View expenses',
  EXPENSE_CREATE: 'Record expenses',
  EXPENSE_UPDATE: 'Edit expenses',

  REPORT_VIEW: 'View reports',
  REPORT_EXPORT: 'Export reports (CSV)',

  ROLE_VIEW: 'View roles',
  ROLE_CREATE: 'Create custom roles',
  ROLE_UPDATE: 'Edit custom roles',
  ROLE_DELETE: 'Delete custom roles',

  SETTINGS_VIEW: 'View event / organization settings',
  SETTINGS_UPDATE: 'Change settings, time slots (token validity)',

  AUDIT_VIEW: 'View the administrative audit log',

  GALLERY_VIEW: 'View festival photos (including private ones)',
  GALLERY_MANAGE: 'Upload, caption, publish and delete festival photos',

  REVIEW_VIEW: 'View visitor reviews and photos (including pending ones)',
  REVIEW_MANAGE: 'Approve, reject, hide, feature and delete visitor reviews',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function permissionGroup(p: Permission): string {
  return p.split('_')[0];
}

export const P = Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, k])) as { [K in Permission]: K };

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: 'MANDAL_ADMIN',
    name: 'Mandal Admin',
    description: 'Full control of the mandal and all its events',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'VOLUNTEER',
    name: 'Volunteer (Gate)',
    description: 'Scans tokens at the entry gate',
    permissions: ['EVENT_VIEW', 'TOKEN_SCAN'],
  },
  {
    key: 'TOKEN_ISSUER',
    name: 'Volunteer (Token desk)',
    description: 'Issues tokens to visitors and can scan',
    permissions: ['EVENT_VIEW', 'TOKEN_VIEW', 'TOKEN_CREATE', 'TOKEN_SCAN'],
  },
  {
    key: 'GATE_SUPERVISOR',
    name: 'Gate Supervisor',
    description: 'Scanning, manual code entry, token lookup and entry reports',
    permissions: ['EVENT_VIEW', 'TOKEN_SCAN', 'TOKEN_VIEW', 'TOKEN_MANUAL_ENTRY', 'REPORT_VIEW'],
  },
  {
    key: 'TREASURER',
    name: 'Treasurer',
    description: 'Donations and expenses',
    permissions: [
      'EVENT_VIEW', 'DONATION_VIEW', 'DONATION_CREATE', 'DONATION_UPDATE',
      'EXPENSE_VIEW', 'EXPENSE_CREATE', 'EXPENSE_UPDATE', 'REPORT_VIEW', 'REPORT_EXPORT', 'GALLERY_VIEW',
    ],
  },
  {
    key: 'REPORT_VIEWER',
    name: 'Report Viewer',
    description: 'Read-only access to reports and statistics',
    permissions: [
      'EVENT_VIEW', 'TOKEN_VIEW', 'VOLUNTEER_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT',
      'DONATION_VIEW', 'EXPENSE_VIEW', 'GALLERY_VIEW', 'REVIEW_VIEW',
    ],
  },
];
