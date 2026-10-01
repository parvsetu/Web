export interface RequestUser {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  /** Set for promotional-partner accounts (they have no org memberships). */
  partnerId?: string | null;
}
