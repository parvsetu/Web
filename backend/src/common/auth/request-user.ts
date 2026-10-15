export interface RequestUser {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  /** Set for promotional-partner accounts (they have no org memberships). */
  partnerId?: string | null;
  /** Set for field-agent accounts (no org memberships either). */
  agentId?: string | null;
  /** Set for stall-vendor accounts (no org memberships either). */
  vendorId?: string | null;
  /** Set for blogger / influencer accounts (no org memberships either). */
  bloggerId?: string | null;
}
