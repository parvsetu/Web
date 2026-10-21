/**
 * "My role" guide: what each role is responsible for and how to do each job
 * in the app. Shown at /guide, filtered by the signed-in person's real
 * permissions (custom roles work the same way — a capability shows when the
 * role has any of its `anyOf` permissions).
 *
 * Keep the tab names and button labels in step with the screens they point to
 * (`TABS` in app/[lang]/org/[orgId]/page.tsx, app/[lang]/e/[eventId]/admin/page.tsx
 * and app/[lang]/platform/page.tsx). A wrong step here is worse than none.
 */
import type { Permission } from './types';

export type GuideArea = 'platform' | 'mandal' | 'festival' | 'gate';

export interface Capability {
  id: string;
  area: GuideArea;
  title: string;
  what: string;
  steps: string[];
  /** Shown when the role has any of these. Empty = super admin only. */
  anyOf: Permission[];
  /** Deep link: org/festival/platform tab key, or a festival sub-page. */
  link?: { kind: 'org'; tab: string } | { kind: 'event'; tab: string } | { kind: 'eventPage'; path: string } | { kind: 'platform'; tab: string };
}

export const AREA_TITLE: Record<GuideArea, string> = {
  platform: 'Platform (all mandals)',
  mandal: 'Mandal management',
  festival: 'Festival management',
  gate: 'At the festival (gate & desk)',
};

export interface RoleProfile {
  key: string;
  name: string;
  summary: string;
  responsibilities: string[];
}

export const SUPER_ADMIN_PROFILE: RoleProfile = {
  key: 'SUPER_ADMIN',
  name: 'Super Admin',
  summary: 'Runs the Parvsetu platform. Decides which mandals and festivals go live, sets fees and pricing, and keeps money, KYC and content safe across every mandal.',
  responsibilities: [
    'Review every new mandal registration and approve, request changes or reject it.',
    'Review every festival submitted for go-live, and confirm or waive its registration fee.',
    'Set registration fees, commission and pass pricing for the platform and for individual mandals.',
    'Verify mandal bank / payout accounts (KYC) and 80G registrations before money or tax benefits flow.',
    'Approve promotional partners (brands), bloggers and field agents, and record their payouts.',
    'Remove reported visitor reviews and unpublish festivals that break the content policy.',
    'Help any mandal when asked — you can open every mandal with full Mandal Admin access. Your actions there are audited.',
  ],
};

/** Responsibilities for the seeded system roles (keys from backend SYSTEM_ROLES). */
export const ROLE_PROFILES: RoleProfile[] = [
  {
    key: 'MANDAL_ADMIN',
    name: 'Mandal Admin',
    summary: 'Owns the mandal on Parvsetu: festivals, team, money, passes and settings. Everything in the mandal goes through you or someone you gave a role to.',
    responsibilities: [
      'Create each festival, set its slots and prices, and submit it for review so it can go live.',
      'Build the team: add members and volunteers, and give each the smallest role that lets them do their job.',
      'Keep pass credit recharged and the bank / payout account verified so passes and online bookings keep working.',
      'Oversee donations, expenses and the yearly accounts (or hand this to a Treasurer).',
      'Watch the Audit log and Reports, and switch off access for anyone who has left.',
      'Keep the public face right: logo, banner, landing page, photos, sponsors and visitor reviews.',
    ],
  },
  {
    key: 'TREASURER',
    name: 'Treasurer / Accountant',
    summary: 'Looks after the mandal’s money: every donation and expense is recorded, receipts go out, and the accounts and 80G filings are correct.',
    responsibilities: [
      'Record every donation (cash, UPI, cheque) the day it is received, and share the numbered receipt with the donor.',
      'Mark promised donations as received when the money comes in.',
      'Record every expense with its category, vendor and bill number, against the right festival.',
      'Check Accounts & P/L each month — income, expenses and profit or loss — and export CSVs for the books.',
      'Keep donor PAN / ID details complete for 80G, file Form 10BD on time and record when Form 10BE is given to donors.',
      'Check online pass orders and stall bookings tally with the money received.',
    ],
  },
  {
    key: 'GATE_SUPERVISOR',
    name: 'Gate Supervisor',
    summary: 'Runs the entry gate: makes sure every visitor is checked, solves problem passes and watches the crowd numbers.',
    responsibilities: [
      'Scan passes at the gate and help volunteers when a pass is refused.',
      'Type a pass’s printed code when its QR won’t scan.',
      'Look up a visitor’s pass to see if it is used, expired or cancelled.',
      'Watch visitors by hour and slot in Reports to spot crowding.',
    ],
  },
  {
    key: 'TOKEN_ISSUER',
    name: 'Volunteer (Token desk)',
    summary: 'Issues entry passes to visitors at the desk, and can also scan.',
    responsibilities: [
      'Issue a pass to each visitor or group with the right slot and number of people.',
      'Show, share or print the QR so the visitor can enter.',
      'Help at the gate by scanning when needed.',
    ],
  },
  {
    key: 'VOLUNTEER',
    name: 'Volunteer (Gate)',
    summary: 'Checks visitors’ passes at the entry gate.',
    responsibilities: [
      'Scan every visitor’s QR pass and let in only those with a green tick.',
      'If a pass is refused, tell the visitor the reason shown and call your supervisor.',
      'Keep mobile data on — every scan is checked live.',
    ],
  },
  {
    key: 'REPORT_VIEWER',
    name: 'Report Viewer',
    summary: 'Sees the numbers without changing anything — useful for committee members and auditors.',
    responsibilities: [
      'Review visitor, pass, donation and expense reports.',
      'Export CSVs for committee meetings or audits.',
      'Report anything that looks wrong to the Mandal Admin or Treasurer — you can’t edit records yourself.',
    ],
  },
];

export const CUSTOM_ROLE_PROFILE = (name: string): RoleProfile => ({
  key: 'CUSTOM',
  name,
  summary: 'A custom role your mandal created. You can do exactly the jobs listed below — nothing more.',
  responsibilities: ['Do the jobs listed below for your mandal.', 'Ask your Mandal Admin if you need access to something that isn’t listed.'],
});

export function profileFor(roleKey: string | null | undefined, roleName?: string | null): RoleProfile {
  return ROLE_PROFILES.find((r) => r.key === roleKey) ?? CUSTOM_ROLE_PROFILE(roleName || 'Custom role');
}

export const CAPABILITIES: Capability[] = [
  // ── Platform (super admin only) ─────────────────────────────────────────
  {
    id: 'p-bell', area: 'platform', anyOf: [], title: 'See everything waiting for you',
    what: 'The bell in the top bar counts every item waiting for a super admin: registrations, festival reviews, reported reviews, payouts, 80G, partners and bloggers.',
    steps: ['Tap the bell in the top bar.', 'Tap an item to jump to that queue in Platform admin.'],
  },
  {
    id: 'p-registrations', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'registrations' }, title: 'Approve new mandals',
    what: 'Every mandal that registers (by itself or through a field agent) waits here. Approving creates the mandal and makes the applicant its Mandal Admin.',
    steps: ['Platform admin → Registrations.', 'Open a registration and check the details, festivals chosen and the content-policy declaration.', 'Press Approve, Request changes (the applicant can edit and resubmit) or Reject with a reason.'],
  },
  {
    id: 'p-event-reviews', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'reviews' }, title: 'Review festivals before they go live',
    what: 'A festival can’t sell or issue passes until you approve it and its registration fee is paid.',
    steps: ['Platform admin → Event reviews.', 'Approve, Request changes or Reject the festival.', 'For the fee: send the payment link (Email / New link), or use Mark paid, Waive fee or Refund fee.', 'Use Unpublish (policy) to take down a live festival that breaks the content policy.'],
  },
  {
    id: 'p-reported', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'reported' }, title: 'Handle reported visitor reviews',
    what: 'Visitors can report a review on a festival page. Reports collect here.',
    steps: ['Platform admin → Reported visitor reviews.', 'Read the review and the report reason.', 'Press Remove to take it down, or dismiss the report.'],
  },
  {
    id: 'p-fees', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'fees' }, title: 'Set festival registration fees',
    what: 'The one-time fee each festival pays before it goes live.',
    steps: ['Platform admin → Event fees.', 'Set the default fee, then override it by category or by festival type.', 'Set the fee for custom (“not listed”) festival types.'],
  },
  {
    id: 'p-billing', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'billing' }, title: 'Pricing, commission and mandal credit',
    what: 'Platform-wide commission and pass pricing rules, per-mandal pricing, and each mandal’s pass credit.',
    steps: ['Platform admin → Billing & earnings.', 'Edit Commission & pricing rules for the whole platform.', 'Pick a mandal to change its own pricing, add or deduct credit (with a reason), or grant / switch off its landing page.', 'Your platform earnings and all credit transactions are listed below.'],
  },
  {
    id: 'p-payouts', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'payouts' }, title: 'Verify bank accounts (KYC) and payouts',
    what: 'A mandal can only take paid online bookings once its payout account is verified.',
    steps: ['Platform admin → Payouts & KYC.', 'Open an account waiting for review, check the PAN, bank and registration details.', 'Mark it Verified, or send it back as Needs correction with a note.', 'Track split settlements and payout history on the same page.'],
  },
  {
    id: 'p-tax', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'tax' }, title: 'Verify 80G registrations',
    what: 'Donation receipts mention 80G only after you verify the mandal’s 80G details.',
    steps: ['Platform admin → 80G verification.', 'Check the URN, validity dates and PAN against the certificate.', 'Press Verify (set the deduction %), or reject with a note.'],
  },
  {
    id: 'p-agents', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'agents' }, title: 'Manage field agents',
    what: 'Field agents register mandals with a referral code and earn per mandal.',
    steps: ['Platform admin → Agents → New agent → Create agent & login (the temporary password is shown once — share it safely).', 'Manage an agent to change rates or status, see their mandals and ledger.', 'Record a payout when you pay them.'],
  },
  {
    id: 'p-partners', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'partners' }, title: 'Approve promotional partners (brands)',
    what: 'Brands pay the platform per pass printed to appear “In association with” on passes.',
    steps: ['Platform admin → Promotional partners.', 'Approve or Reject a campaign; Pause / Resume running ones.', 'Suspend a brand if needed, and check its Wallet balance.'],
  },
  {
    id: 'p-vendors', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'vendors' }, title: 'Oversee stall vendors',
    what: 'Every vendor who books stalls at festivals.',
    steps: ['Platform admin → Stall vendors.', 'Search a vendor to see their bookings; suspend or reactivate them with a note.'],
  },
  {
    id: 'p-bloggers', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'bloggers' }, title: 'Approve bloggers and their festivals',
    what: 'Bloggers share referral links to festivals and earn a commission on bookings.',
    steps: ['Platform admin → Bloggers.', 'Approve blogger (or Reject) new sign-ups.', 'Manage a blogger to Approve each festival they want to promote, set commission, switch off a link, or record a payout.'],
  },
  {
    id: 'p-orgs', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'orgs' }, title: 'Mandals',
    what: 'Every mandal on the platform. You can open any of them with full Mandal Admin access.',
    steps: ['Platform admin → Mandals to browse or search.', 'New organisation creates a mandal directly (without a registration).', 'Set or change the field agent credited for a mandal (needs a reason — it is audited).', 'From My festivals, tap “Manage <mandal>” to work inside it.'],
  },
  {
    id: 'p-users', area: 'platform', anyOf: [], link: { kind: 'platform', tab: 'users' }, title: 'Users',
    what: 'Everyone with a Parvsetu login: organisers, volunteers, agents, partners, vendors, bloggers.',
    steps: ['Platform admin → Users, then search by name, mobile or email.', 'Filter by type to find, for example, people with no access yet.', 'Disable an account (with a reason) to stop all access, or re-activate it.'],
  },

  // ── Mandal (org-wide) ───────────────────────────────────────────────────
  {
    id: 'm-festivals', area: 'mandal', anyOf: ['EVENT_CREATE'], link: { kind: 'org', tab: 'events' }, title: 'Create a festival',
    what: 'Each festival (Ganesh Utsav, Durga Puja, a mela…) is set up as a draft and goes live after platform review and the registration fee.',
    steps: ['Mandal admin → Festivals → New festival.', 'Choose the type, dates, venue and token prefix.', 'Open the festival dashboard and add Time slots with prices.', 'Press “Submit for review”. Once approved and the fee is paid it goes live automatically.'],
  },
  {
    id: 'm-members', area: 'mandal', anyOf: ['USER_VIEW'], link: { kind: 'org', tab: 'members' }, title: 'Add committee members',
    what: 'Members get one role that applies to every festival of the mandal — use this for the treasurer, secretary, report viewers and other admins.',
    steps: ['Mandal admin → Members → Add member.', 'Enter name and mobile (email optional), choose the role.', 'Share the login details. You can only give roles with permissions you have yourself.', 'To stop someone’s access, set them Inactive or remove their role.'],
  },
  {
    id: 'm-volunteers', area: 'mandal', anyOf: ['VOLUNTEER_VIEW'], link: { kind: 'org', tab: 'volunteers' }, title: 'Add volunteers',
    what: 'Volunteers are assigned to a specific festival with a role such as Gate or Token desk.',
    steps: ['Mandal admin → Volunteers → Add volunteer (or the festival’s Volunteers tab → Assign volunteer).', 'Pick the festival and the role (default: Volunteer – Gate).', 'Set an assignment Inactive when the person stops volunteering.'],
  },
  {
    id: 'm-applications', area: 'mandal', anyOf: ['VOLUNTEER_ASSIGN'], link: { kind: 'org', tab: 'applications' }, title: 'Approve volunteer requests',
    what: 'People who create their own account can ask to volunteer at your festival.',
    steps: ['Mandal admin → Applications.', 'Approve (choose their role) or Reject with an optional reason shown to them.'],
  },
  {
    id: 'm-roles', area: 'mandal', anyOf: ['ROLE_VIEW'], link: { kind: 'org', tab: 'roles' }, title: 'Custom roles',
    what: 'System roles cover most needs. Create a custom role when someone needs a specific mix of permissions.',
    steps: ['Mandal admin → Roles → New custom role.', 'Name it, tick exactly the permissions needed, save.', 'Give it to people from Members or Volunteers.'],
  },
  {
    id: 'm-accounts', area: 'mandal', anyOf: ['EXPENSE_VIEW'], link: { kind: 'org', tab: 'accounts' }, title: 'Accounts & profit / loss',
    what: 'Income (donations, passes, stalls) and expenses for the whole mandal, by month, by festival and by category.',
    steps: ['Mandal admin → Accounts & P/L.', 'Choose the year type (financial / calendar) and year.', 'Add expense for mandal-wide costs not tied to one festival.', 'Read Month by month, Where the money went and By festival.'],
  },
  {
    id: 'm-tax', area: 'mandal', anyOf: ['DONATION_TAX_VIEW'], link: { kind: 'org', tab: 'tax' }, title: '80G, Form 10BD and 10BE',
    what: 'If the mandal has 80G, donors can claim a tax deduction. You must file Form 10BD every year and give each donor Form 10BE.',
    steps: ['Mandal admin → 80G & Form 10BD.', 'Enter the 80G URN, validity dates and mandal PAN, then Submit for verification (the Parvsetu team verifies it).', 'Each year: check donors have PAN / ID, export Form 10BD, then record the acknowledgement number and filing date (Save filing).', 'Record when Form 10BE was given to each donor.'],
  },
  {
    id: 'm-sponsors', area: 'mandal', anyOf: ['EVENT_UPDATE'], link: { kind: 'org', tab: 'sponsors' }, title: 'Sponsors',
    what: 'Show sponsors on your festival and booking pages, and optionally on passes — free, no credit used.',
    steps: ['Mandal admin → Sponsors.', 'Add the sponsor’s logo, tier and message, and choose whether it prints on passes.'],
  },
  {
    id: 'm-gallery', area: 'mandal', anyOf: ['GALLERY_VIEW'], link: { kind: 'org', tab: 'gallery' }, title: 'Photo gallery',
    what: 'Every festival’s photos collected by year (300 MB per mandal).',
    steps: ['Mandal admin → Gallery to browse by year.', 'Upload photos from each festival’s Photos tab.'],
  },
  {
    id: 'm-reviews', area: 'mandal', anyOf: ['REVIEW_VIEW'], link: { kind: 'org', tab: 'reviews' }, title: 'Visitor reviews',
    what: 'Reviews and photos visitors leave on your festival pages.',
    steps: ['Mandal admin → Visitor reviews.', 'Approve, reject, hide or feature reviews (needs “Manage reviews”).'],
  },
  {
    id: 'm-landing', area: 'mandal', anyOf: ['SETTINGS_VIEW'], link: { kind: 'org', tab: 'landing' }, title: 'Mandal landing page',
    what: 'Your own page at /m/<mandal>, paid yearly.',
    steps: ['Mandal admin → Landing page.', 'Buy or renew for a year, then edit headline, about, highlights, contacts and social links.', 'Use Preview before it goes public.'],
  },
  {
    id: 'm-credit', area: 'mandal', anyOf: ['SETTINGS_VIEW'], link: { kind: 'org', tab: 'credit' }, title: 'Pass credit',
    what: 'Prepaid balance used for every pass issued. Issuing stops when it runs out.',
    steps: ['Mandal admin → Pass credit.', 'Recharge, pick an amount and pay.', 'Credit history lists every deduction with the pass it was for.'],
  },
  {
    id: 'm-payouts', area: 'mandal', anyOf: ['SETTINGS_VIEW'], link: { kind: 'org', tab: 'payouts' }, title: 'Bank account & payouts',
    what: 'Where online pass, competition and stall money is paid. Needed before paid online booking works.',
    steps: ['Mandal admin → Payouts & bank → Add your bank account.', 'Choose who receives the money (registered trust / society or unregistered), add PAN, bank, address and contact.', 'Wait for the Parvsetu team to verify it. Settlements and payouts are listed on the same page.'],
  },
  {
    id: 'm-audit', area: 'mandal', anyOf: ['AUDIT_VIEW'], link: { kind: 'org', tab: 'audit' }, title: 'Audit log',
    what: 'Who did what and when — passes issued or cancelled, roles changed, money edited, settings changed.',
    steps: ['Mandal admin → Audit log.', 'Filter by festival or search a name.'],
  },
  {
    id: 'm-reports', area: 'mandal', anyOf: ['REPORT_VIEW'], link: { kind: 'org', tab: 'reports' }, title: 'Mandal reports',
    what: 'Reports across all your festivals.',
    steps: ['Mandal admin → Reports and pick a festival.', 'Download CSV where shown (needs “Export reports”).'],
  },
  {
    id: 'm-settings', area: 'mandal', anyOf: ['SETTINGS_UPDATE'], link: { kind: 'org', tab: 'settings' }, title: 'Mandal settings, logo & banner',
    what: 'Mandal details, logo and banner used on passes, receipts and public pages.',
    steps: ['Mandal admin → Settings.', 'Upload the logo and banner under Logo & banner.'],
  },

  // ── Festival ────────────────────────────────────────────────────────────
  {
    id: 'f-settings', area: 'festival', anyOf: ['EVENT_UPDATE'], link: { kind: 'event', tab: 'settings' }, title: 'Festival settings',
    what: 'Dates, venue, public booking, online sales window, GST, print format and pass validity.',
    steps: ['Open the festival → Festival dashboard → Settings.', 'Turn on Public booking and set when online sales open and close.', 'Set GST only if the mandal is GST-registered.'],
  },
  {
    id: 'f-slots', area: 'festival', anyOf: ['SETTINGS_UPDATE'], link: { kind: 'event', tab: 'slots' }, title: 'Time slots & prices',
    what: 'Each slot has a time window, capacity and price per person. Peak pricing raises prices on busy days.',
    steps: ['Festival dashboard → Time slots → Add slot.', 'Set label, start / end time, capacity and pass price (₹0 = free).', 'Add Peak pricing rules for weekends or special dates.'],
  },
  {
    id: 'f-programme', area: 'festival', anyOf: ['EVENT_UPDATE'], link: { kind: 'event', tab: 'programme' }, title: 'Programme & line-up',
    what: 'Day-wise programme, star line-up and reel embeds shown on the public festival page.',
    steps: ['Festival dashboard → Programme & line-up.', 'Add items per day; mark star performers.'],
  },
  {
    id: 'f-competitions', area: 'festival', anyOf: ['EVENT_UPDATE'], link: { kind: 'event', tab: 'competitions' }, title: 'Competitions',
    what: 'Paid online entries with bib numbers, check-in, heats, results and certificates.',
    steps: ['Festival dashboard → Competitions.', 'Create categories with entry fee and rules.', 'On the day use Competition check-in from the festival home, then publish results.'],
  },
  {
    id: 'f-tokens', area: 'festival', anyOf: ['TOKEN_VIEW', 'TOKEN_GENERATE'], link: { kind: 'event', tab: 'tokens' }, title: 'Passes (tokens)',
    what: 'Every pass issued for the festival, its status and scan history.',
    steps: ['Festival dashboard → Tokens.', 'Search a visitor or code to see if a pass is active, used, expired or cancelled.', 'Bulk generate and Print sheet (needs “Bulk-generate tokens”).', 'Cancel a pass issued by mistake (needs “Cancel tokens”).'],
  },
  {
    id: 'f-volunteers', area: 'festival', anyOf: ['VOLUNTEER_VIEW'], link: { kind: 'event', tab: 'volunteers' }, title: 'Festival volunteers',
    what: 'Who is assigned to this festival, their role and their scans.',
    steps: ['Festival dashboard → Volunteers → Assign volunteer.', 'Search people in the mandal, pick a role.', 'Set an assignment Inactive to stop access.'],
  },
  {
    id: 'f-donations', area: 'festival', anyOf: ['DONATION_VIEW'], link: { kind: 'event', tab: 'donations' }, title: 'Donations & receipts',
    what: 'Every donation gets a numbered receipt you can share on WhatsApp or print. 80G is shown on it when verified.',
    steps: ['Festival dashboard → Donations → Record donation (needs “Record donations”).', 'Enter donor name, amount and method; add PAN / ID and address for 80G donors.', 'Choose “Already received (cash / UPI)” or Promise if the money is still to come.', 'Tick “Give entry passes to this donor” to issue passes with the receipt.', 'Later, update a promise to received (needs “Update donation payment status”).', 'Online: tick “Online donations” in the festival settings (payout account must be verified). Visitors then donate from the festival page; their donations arrive here already paid, with a “Website” badge.'],
  },
  {
    id: 'f-expenses', area: 'festival', anyOf: ['EXPENSE_VIEW'], link: { kind: 'event', tab: 'expenses' }, title: 'Expenses',
    what: 'Festival costs by category — decoration, sound, prasad, pandal…',
    steps: ['Festival dashboard → Expenses → Add expense (needs “Record expenses”).', 'Enter date, category, amount, description, vendor and bill number.', 'Edits ask for a reason and are kept in the audit log.'],
  },
  {
    id: 'f-passes', area: 'festival', anyOf: ['DONATION_VIEW'], link: { kind: 'event', tab: 'passes' }, title: 'Online pass orders',
    what: 'Passes visitors bought online, with payment and GST invoice.',
    steps: ['Festival dashboard → Online passes.', 'Search an order to check payment status or open its invoice.'],
  },
  {
    id: 'f-stalls', area: 'festival', anyOf: ['STALL_VIEW'], link: { kind: 'event', tab: 'stalls' }, title: 'Stalls',
    what: 'Stall types vendors can book and pay for online.',
    steps: ['Festival dashboard → Stalls → Add stall type (needs “Manage stalls”).', 'Set price, number of stalls, and switch on “Open stall booking to vendors”.', 'Assign stall numbers to vendor bookings; Cancel & refund if needed.'],
  },
  {
    id: 'f-photos', area: 'festival', anyOf: ['GALLERY_VIEW'], link: { kind: 'event', tab: 'photos' }, title: 'Photos',
    what: 'Festival photos — private to your team until you publish them.',
    steps: ['Festival dashboard → Photos.', 'Upload (needs “Manage photos”), caption, and tap the globe to make a photo public.'],
  },
  {
    id: 'f-art', area: 'festival', anyOf: ['GALLERY_MANAGE'], link: { kind: 'event', tab: 'art' }, title: 'Art gallery',
    what: 'Display-only or for-sale artworks. Buyers send enquiries; no payment goes through Parvsetu.',
    steps: ['Festival dashboard → Art gallery.', 'Add pieces and answer buyer enquiries directly.'],
  },
  {
    id: 'f-promote', area: 'festival', anyOf: ['EVENT_UPDATE'], link: { kind: 'event', tab: 'promote' }, title: 'Promote the festival',
    what: 'Public page link, share buttons and a ready Instagram poster.',
    steps: ['Festival dashboard → Promote.', 'Copy the link or download the poster and share it.'],
  },
  {
    id: 'f-reports', area: 'festival', anyOf: ['REPORT_VIEW'], link: { kind: 'event', tab: 'reports' }, title: 'Festival reports',
    what: 'Visitors by date / hour / slot, scans, tokens, donations by method, expenses by category, stall rent and GST.',
    steps: ['Festival dashboard → Reports (Overview and Scans tabs show live numbers).', 'Pick a date range; download CSV (needs “Export reports”).'],
  },

  // ── Gate & desk ─────────────────────────────────────────────────────────
  {
    id: 'g-scan', area: 'gate', anyOf: ['TOKEN_SCAN'], link: { kind: 'eventPage', path: 'scan' }, title: 'Scan passes at the gate',
    what: 'Each QR works exactly once. Green tick = let them in; red shows why it was refused.',
    steps: ['Open the festival → SCAN QR TOKEN.', 'Allow camera access and point at the pass.', 'Green: allow entry. Red: tell the visitor the reason (used, expired, wrong festival, cancelled) and call your supervisor.', 'My scans shows your own scans for today.'],
  },
  {
    id: 'g-manual', area: 'gate', anyOf: ['TOKEN_MANUAL_ENTRY'], link: { kind: 'eventPage', path: 'scan' }, title: 'Type a pass code',
    what: 'When a QR is damaged or the camera won’t work.',
    steps: ['On the scanner, choose to type the code.', 'Enter the code printed under the QR.'],
  },
  {
    id: 'g-issue', area: 'gate', anyOf: ['TOKEN_CREATE'], link: { kind: 'eventPage', path: 'issue' }, title: 'Issue a pass at the desk',
    what: 'Uses the mandal’s pass credit. The festival home shows how many more passes you can issue.',
    steps: ['Open the festival → ISSUE TOKEN.', 'Enter visitor name and mobile, pick the slot and number of people.', 'For groups choose “One QR per person” or “1 group QR”.', 'Show the QR on screen, share it, or print it.'],
  },
];

export interface GuideContext {
  orgId?: string;
  eventId?: string;
}

export function capabilityHref(c: Capability, ctx: GuideContext): string | null {
  const l = c.link;
  if (!l) return null;
  if (l.kind === 'platform') return `/platform#${l.tab}`;
  if (l.kind === 'org') return ctx.orgId ? `/org/${ctx.orgId}#${l.tab}` : null;
  if (l.kind === 'event') return ctx.eventId ? `/e/${ctx.eventId}/admin#${l.tab}` : null;
  return ctx.eventId ? `/e/${ctx.eventId}/${l.path}` : null;
}

export function allowed(c: Capability, perms: readonly string[], superAdmin: boolean): boolean {
  if (c.anyOf.length === 0) return superAdmin;
  return superAdmin || c.anyOf.some((p) => perms.includes(p));
}
