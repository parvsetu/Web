/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { encryptField } from '../src/common/crypto/field-crypto';
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, permissionGroup } from '../src/common/permissions';

const prisma = new PrismaClient();

/** Permission catalog + system roles: always synced, safe to rerun. */
export async function seedCatalog(db: PrismaClient = prisma) {
  for (const key of ALL_PERMISSIONS) {
    await db.permission.upsert({
      where: { key },
      create: { key, group: permissionGroup(key), description: PERMISSIONS[key] },
      update: { group: permissionGroup(key), description: PERMISSIONS[key] },
    });
  }
  for (const def of SYSTEM_ROLES) {
    const existing = await db.role.findFirst({ where: { organizationId: null, key: def.key } });
    const role = existing
      ? await db.role.update({ where: { id: existing.id }, data: { name: def.name, description: def.description, isSystem: true } })
      : await db.role.create({ data: { key: def.key, name: def.name, description: def.description, isSystem: true } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: def.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
  }
}

const LOCAL_DEMO_PASSWORD = 'Parvsetu@123';
const IS_PROD = process.env.NODE_ENV === 'production';

async function seedDemo() {
  if (await prisma.organization.findUnique({ where: { slug: 'shree-durga-mandal' } })) {
    console.log('Demo data already present — skipping (delete the demo orgs to reseed).');
    return;
  }
  // The local default password is published in the README. On a deployed
  // (public) instance the demo password must come from env, and no demo super
  // admin is created — the BOOTSTRAP_ADMIN account already is one.
  const password = process.env.DEMO_PASSWORD ?? (IS_PROD ? '' : LOCAL_DEMO_PASSWORD);
  if (password.length < 10) {
    // Warn, don't throw: a failed seed would also stop the API from starting.
    console.warn('SEED_DEMO is on but DEMO_PASSWORD (min 10 chars) is not set — skipping demo data.');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const role = async (key: string) => (await prisma.role.findFirstOrThrow({ where: { organizationId: null, key } })).id;
  const user = (name: string, mobile: string, email: string, isSuperAdmin = false) =>
    prisma.user.create({ data: { name, mobile, email, passwordHash: hash, isSuperAdmin } });

  const superAdmin = IS_PROD ? null : await user('Platform Admin', '9000000001', 'super@parvsetu.dev', true);
  const admin = await user('Ananya Sen', '9000000002', 'admin@parvsetu.dev');
  const gate = await user('Rahul Das', '9000000003', 'gate@parvsetu.dev');
  const desk = await user('Priya Roy', '9000000004', 'desk@parvsetu.dev');
  const viewer = await user('Sanjay Ghosh', '9000000005', 'viewer@parvsetu.dev');
  const treasurer = await user('Meera Bose', '9000000006', 'treasurer@parvsetu.dev');
  const otherAdmin = await user('Kiran Patel', '9000000007', 'navratri-admin@parvsetu.dev');
  const applicant = await user('Arjun Mehta', '9000000008', 'applicant@parvsetu.dev');
  const gate2 = await user('Sourav Pal', '9000000009', 'gate2@parvsetu.dev');
  const gate3 = await user('Ishita Dey', '9000000010', 'gate3@parvsetu.dev');
  const supervisor = await user('Debasish Kar', '9000000011', 'supervisor@parvsetu.dev');

  const tz = 'Asia/Kolkata';
  const today = DateTime.now().setZone(tz).startOf('day');
  const d = (dt: DateTime) => new Date(`${dt.toISODate()}T00:00:00.000Z`);

  const mandal = await prisma.organization.create({ data: { name: 'Shree Durga Mandal', slug: 'shree-durga-mandal', city: 'Kolkata', address: 'Salt Lake, Sector 1' } });
  const other = await prisma.organization.create({ data: { name: 'Navratri Seva Samiti', slug: 'navratri-seva-samiti', city: 'Ahmedabad' } });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: mandal.id, userId: admin.id, roleId: await role('MANDAL_ADMIN') },
      { organizationId: mandal.id, userId: viewer.id, roleId: await role('REPORT_VIEWER') },
      { organizationId: mandal.id, userId: treasurer.id, roleId: await role('TREASURER') },
      { organizationId: other.id, userId: otherAdmin.id, roleId: await role('MANDAL_ADMIN') },
    ],
  });

  const durga = await prisma.event.create({
    data: {
      organizationId: mandal.id, name: `Durga Puja ${today.year}`, festivalType: 'DURGA_PUJA', location: 'Salt Lake pandal',
      startDate: d(today.minus({ days: 1 })), endDate: d(today.plus({ days: 9 })), timezone: tz, status: 'ACTIVE',
      tokenPrefix: 'DUR', volunteerRegistrationOpen: true, maxVisitorsPerToken: 6,
    },
  });
  const ganesh = await prisma.event.create({
    data: {
      organizationId: mandal.id, name: `Ganesh Utsav ${today.year}`, festivalType: 'GANESH_UTSAV',
      startDate: d(today.minus({ days: 30 })), endDate: d(today.minus({ days: 20 })), timezone: tz, status: 'COMPLETED', tokenPrefix: 'GAN',
    },
  });
  const navratri = await prisma.event.create({
    data: {
      organizationId: other.id, name: `Navratri ${today.year}`, festivalType: 'NAVRATRI', location: 'GMDC Ground',
      startDate: d(today), endDate: d(today.plus({ days: 9 })), timezone: tz, status: 'ACTIVE', tokenPrefix: 'NAV', volunteerRegistrationOpen: true,
    },
  });

  await prisma.eventAssignment.createMany({
    data: [
      { eventId: durga.id, userId: gate.id, roleId: await role('VOLUNTEER'), assignedById: admin.id },
      { eventId: durga.id, userId: desk.id, roleId: await role('TOKEN_ISSUER'), assignedById: admin.id },
      { eventId: durga.id, userId: gate2.id, roleId: await role('VOLUNTEER'), assignedById: admin.id },
      { eventId: durga.id, userId: gate3.id, roleId: await role('VOLUNTEER'), assignedById: admin.id },
      { eventId: durga.id, userId: supervisor.id, roleId: await role('GATE_SUPERVISOR'), assignedById: admin.id },
      { eventId: navratri.id, userId: gate.id, roleId: await role('VOLUNTEER'), assignedById: otherAdmin.id, status: 'INACTIVE' },
    ],
  });
  await prisma.volunteerApplication.create({ data: { userId: applicant.id, organizationId: mandal.id, eventId: durga.id, message: 'I can help at the gate in the evenings.' } });

  const slotDefs = [
    ['Morning 06-08', '06:00', '08:00'], ['Morning 08-10', '08:00', '10:00'], ['Late morning 10-12', '10:00', '12:00'],
    ['Evening 17-19', '17:00', '19:00'], ['Evening 19-21', '19:00', '21:00'], ['Night 21-23', '21:00', '23:00'],
  ];
  for (const ev of [durga, ganesh, navratri]) {
    for (const [i, [label, startTime, endTime]] of slotDefs.entries()) {
      await prisma.timeSlot.create({ data: { eventId: ev.id, label, startTime, endTime, sortOrder: i, capacity: 500 } });
    }
  }

  // Durga Puja tokens for yesterday and today, every slot. Ended slots are
  // mostly used (spread across three gates), with some no-shows, cancellations,
  // duplicate attempts and the odd too-early / expired / invalid scan, so every
  // report and the dashboard have something real to show.
  const slots = await prisma.timeSlot.findMany({ where: { eventId: durga.id }, orderBy: { sortOrder: 'asc' } });
  const gates = [gate, gate2, gate3];
  let seq = 0;
  const now = new Date();
  for (const day of [today.minus({ days: 1 }), today]) {
    for (const slot of slots) {
      const from = DateTime.fromISO(`${day.toISODate()}T${slot.startTime}`, { zone: tz });
      const until = DateTime.fromISO(`${day.toISODate()}T${slot.endTime}`, { zone: tz });
      const ended = until.toJSDate() <= now;
      const started = from.toJSDate() <= now;
      const perSlot = 10 + ((seq * 7) % 9);
      for (let i = 0; i < perSlot; i++) {
        seq++;
        const cancelled = i === perSlot - 1;
        const used = !cancelled && (ended ? i < perSlot - 3 : started && i < 3);
        const scanner = gates[seq % gates.length];
        const usedAt = used ? from.plus({ minutes: 5 + ((i * 11) % 110) }) : null;
        const token = await prisma.token.create({
          data: {
            eventId: durga.id, tokenCode: `DUR-${today.year}-${String(seq).padStart(6, '0')}`, secureToken: randomBytes(16).toString('base64url'),
            timeSlotId: slot.id, visitorCount: 1 + (seq % 4), validFrom: from.toJSDate(), validUntil: until.toJSDate(), issuedById: desk.id,
            issuedAt: from.minus({ hours: 2 + (i % 5) }).toJSDate(),
            status: used ? 'USED' : cancelled ? 'CANCELLED' : 'ACTIVE',
            usedAt: usedAt?.toJSDate() ?? null, usedById: used ? scanner.id : null,
            cancelledAt: cancelled ? from.minus({ hours: 1 }).toJSDate() : null, cancelledById: cancelled ? admin.id : null,
            cancellationReason: cancelled ? 'Visitor booked twice' : null,
          },
        });
        if (used) {
          await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: scanner.id, result: 'SUCCESS', scanTime: usedAt!.toJSDate() } });
          if (i % 6 === 0) {
            await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: gates[(seq + 1) % 3].id, result: 'ALREADY_USED', scanTime: usedAt!.plus({ minutes: 12 }).toJSDate() } });
          }
        }
        if (cancelled && ended) {
          await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: scanner.id, result: 'CANCELLED', scanTime: from.plus({ minutes: 20 }).toJSDate() } });
        }
        if (!used && !cancelled && ended && i === perSlot - 2) {
          await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: scanner.id, result: 'EXPIRED', scanTime: until.plus({ minutes: 15 }).toJSDate() } });
        }
        if (i === 1 && started) {
          await prisma.scanLog.create({ data: { tokenId: null, eventId: durga.id, userId: scanner.id, result: 'INVALID', failureReason: 'bad QR signature/format', scanTime: from.plus({ minutes: 30 }).toJSDate() } });
        }
      }
    }
  }
  await prisma.event.update({ where: { id: durga.id }, data: { tokenSeq: seq } });

  const donations = [
    ['Ravi Chatterjee', '5001.00', 'CASH', 1], ['Sunita Mukherjee', '2100.00', 'UPI', 1], ['Local Traders Assn.', '25000.00', 'BANK_TRANSFER', 1],
    ['Amit Banerjee', '1101.00', 'CASH', 0], ['Rina Saha', '501.00', 'UPI', 0], ['Salt Lake Residents Welfare', '15000.00', 'BANK_TRANSFER', 0],
    ['Anonymous', '251.00', 'CASH', 0], ['Gupta Sweets', '3100.00', 'UPI', 0],
  ] as const;
  for (const [i, [donorName, amount, method, daysAgo]] of donations.entries()) {
    await prisma.donation.create({
      data: {
        eventId: durga.id, donorName, amount, method, paymentStatus: 'SUCCESS', paymentProvider: 'manual',
        receiptNo: `DUR-R-${today.year}-${String(i + 1).padStart(5, '0')}`, createdById: treasurer.id,
        donatedAt: today.minus({ days: daysAgo }).plus({ hours: 10 + i }).toJSDate(),
        paymentReference: method === 'UPI' ? `UPI${4100 + i}` : null,
      },
    });
  }
  await prisma.donation.create({
    data: { eventId: durga.id, donorName: 'Online donor (pending)', amount: '1001.00', method: 'ONLINE', paymentStatus: 'PENDING', paymentProvider: 'manual', createdById: treasurer.id },
  });
  await prisma.event.update({ where: { id: durga.id }, data: { donationReceiptSeq: donations.length } });
  await prisma.expense.createMany({
    data: [
      { organizationId: mandal.id, eventId: durga.id, category: 'Decoration', description: 'Pandal lighting', amount: '12000.00', expenseDate: d(today.minus({ days: 1 })), vendor: 'Bright Lights Co.', createdById: treasurer.id },
      { organizationId: mandal.id, eventId: durga.id, category: 'Bhog', description: 'Prasad ingredients', amount: '4500.00', expenseDate: d(today), createdById: treasurer.id },
      { organizationId: mandal.id, eventId: durga.id, category: 'Idol', description: 'Pratima — balance payment', amount: '35000.00', expenseDate: d(today.minus({ days: 1 })), vendor: 'Kumartuli Artisans', createdById: treasurer.id },
      { organizationId: mandal.id, eventId: durga.id, category: 'Sound', description: 'Dhak players (2 days)', amount: '8000.00', expenseDate: d(today), vendor: 'Dhaki Sangha', createdById: treasurer.id },
      { organizationId: mandal.id, eventId: durga.id, category: 'Security', description: 'Night guards', amount: '6000.00', expenseDate: d(today), vendor: 'SafeGuard Services', createdById: treasurer.id },
    ],
  });

  console.log(`
Demo data created (${seq} Durga Puja tokens). Demo password: ${IS_PROD ? '(DEMO_PASSWORD from env)' : password}
  super admin        9000000001  super@parvsetu.dev          ${IS_PROD ? '(not created in production)' : ''}
  mandal admin       9000000002  admin@parvsetu.dev          (Shree Durga Mandal)
  gate volunteer     9000000003  gate@parvsetu.dev           (Durga Puja: scan only)
  token desk         9000000004  desk@parvsetu.dev           (Durga Puja: issue + scan)
  report viewer      9000000005  viewer@parvsetu.dev
  treasurer          9000000006  treasurer@parvsetu.dev
  other mandal admin 9000000007  navratri-admin@parvsetu.dev (Navratri Seva Samiti — isolated)
  pending applicant  9000000008  applicant@parvsetu.dev
  more gate staff    9000000009 / 9000000010, supervisor 9000000011
${superAdmin ? `super admin id: ${superAdmin.id}` : ''}`);
}

/**
 * First platform admin for a fresh deployment, from env (set once in the
 * hosting dashboard). Never overwrites an existing account.
 */
async function seedBootstrapAdmin() {
  const { BOOTSTRAP_ADMIN_MOBILE: mobile, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  if (!mobile || !password) return;
  if (password.length < 10) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters');
  if (await prisma.user.findUnique({ where: { mobile } })) {
    console.log('Bootstrap admin already exists — leaving it unchanged.');
    return;
  }
  await prisma.user.create({
    data: {
      name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Platform Admin',
      mobile,
      email: process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase() || null,
      passwordHash: await bcrypt.hash(password, 10),
      isSuperAdmin: true,
    },
  });
  console.log(`Bootstrap super admin created for ${mobile}.`);
}

/**
 * Brings existing demo data up to date with later features (state/city,
 * public pass booking, mandal-wide expenses). Idempotent: each change only
 * applies while its field is still unset.
 */
async function upgradeDemo() {
  const mandal = await prisma.organization.findUnique({ where: { slug: 'shree-durga-mandal' } });
  if (!mandal) return;
  const other = await prisma.organization.findUnique({ where: { slug: 'navratri-seva-samiti' } });
  if (!mandal.state) {
    await prisma.organization.update({ where: { id: mandal.id }, data: { state: 'West Bengal', city: 'Kolkata' } });
    await prisma.event.updateMany({ where: { organizationId: mandal.id }, data: { state: 'West Bengal', city: 'Kolkata' } });
  }
  if (other && !other.state) {
    await prisma.organization.update({ where: { id: other.id }, data: { state: 'Gujarat', city: 'Ahmedabad' } });
    await prisma.event.updateMany({ where: { organizationId: other.id }, data: { state: 'Gujarat', city: 'Ahmedabad' } });
  }
  const durga = await prisma.event.findFirst({ where: { organizationId: mandal.id, festivalType: 'DURGA_PUJA' } });
  if (durga && !durga.publicBookingEnabled) {
    await prisma.event.update({ where: { id: durga.id }, data: { publicBookingEnabled: true } });
    const prices: Record<string, string> = { 'Morning 06-08': '0', 'Morning 08-10': '30', 'Late morning 10-12': '30', 'Evening 17-19': '50', 'Evening 19-21': '100', 'Night 21-23': '75' };
    for (const [label, price] of Object.entries(prices)) {
      await prisma.timeSlot.updateMany({ where: { eventId: durga.id, label }, data: { price } });
    }
  }
  if (other) {
    const nav = await prisma.event.findFirst({ where: { organizationId: other.id, festivalType: 'NAVRATRI' } });
    if (nav && !nav.publicBookingEnabled) {
      await prisma.event.update({ where: { id: nav.id }, data: { publicBookingEnabled: true } });
      await prisma.timeSlot.updateMany({ where: { eventId: nav.id }, data: { price: '150' } });
    }
  }
  // Demo mandals start with ₹1,000 prepaid token credit (once).
  for (const o of [mandal, other].filter(Boolean)) {
    const exists = await prisma.orgBilling.findUnique({ where: { organizationId: o!.id } });
    if (!exists) {
      await prisma.orgBilling.create({ data: { organizationId: o!.id, creditBalancePaise: 100000 } });
      await prisma.creditTransaction.create({ data: { organizationId: o!.id, type: 'ADJUSTMENT', amountPaise: 100000, balanceAfterPaise: 100000, note: 'Demo credit' } });
    }
  }
  // Verified demo payout accounts: a registered trust and an unregistered mandal.
  const adminUser = await prisma.user.findUnique({ where: { mobile: '9000000002' } });
  if (adminUser && !(await prisma.payoutAccount.findUnique({ where: { organizationId: mandal.id } }))) {
    await prisma.payoutAccount.create({ data: {
      organizationId: mandal.id, entityType: 'REGISTERED', registeredType: 'TRUST', legalName: 'Shree Durga Puja Samiti Trust', registrationNumber: 'WB/TR/2011/0457',
      orgPanEnc: encryptField('AAATS1234Z'), orgPanLast4: '234Z', reg80G: 'AAATS1234ZF20211', reg12A: 'AAATS1234ZE20211',
      addressLine: 'Salt Lake, Sector 1', city: 'Kolkata', state: 'West Bengal', pincode: '700064',
      contactName: 'Ananya Sen', contactRole: 'Secretary', contactPhone: '9000000002', contactEmail: 'admin@parvsetu.dev',
      signatoryPanEnc: encryptField('ABCPS1234K'), signatoryPanLast4: '234K',
      bankHolderName: 'Shree Durga Puja Samiti Trust', bankAccountEnc: encryptField('012345678901'), bankAccountLast4: '8901', ifsc: 'SBIN0001234', accountType: 'CURRENT',
      status: 'VERIFIED', reviewedAt: new Date(), reviewNote: 'Demo account', consentAt: new Date(), submittedById: adminUser.id,
    } });
  }
  const navAdmin = await prisma.user.findUnique({ where: { mobile: '9000000007' } });
  if (other && navAdmin && !(await prisma.payoutAccount.findUnique({ where: { organizationId: other.id } }))) {
    await prisma.payoutAccount.create({ data: {
      organizationId: other.id, entityType: 'UNREGISTERED', legalName: 'Navratri Seva Samiti (Kiran Patel)',
      addressLine: 'GMDC Ground, Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015',
      contactName: 'Kiran Patel', contactRole: 'President', contactPhone: '9000000007', contactEmail: 'navratri-admin@parvsetu.dev',
      signatoryPanEnc: encryptField('BKLPP4321M'), signatoryPanLast4: '321M',
      bankHolderName: 'Kiran Patel', bankAccountEnc: encryptField('998877665544'), bankAccountLast4: '5544', ifsc: 'HDFC0000123', accountType: 'SAVINGS',
      status: 'VERIFIED', reviewedAt: new Date(), reviewNote: 'Demo account', consentAt: new Date(), submittedById: navAdmin.id,
    } });
  }
  const treasurer = await prisma.user.findUnique({ where: { mobile: '9000000006' } });
  if (!(await prisma.expense.findFirst({ where: { organizationId: mandal.id, eventId: null } }))) {
    const y = DateTime.now().setZone('Asia/Kolkata').year;
    const d = (mo: number, day = 5) => new Date(`${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`);
    await prisma.expense.createMany({
      data: [
        { organizationId: mandal.id, category: 'Rent', description: 'Godown rent (Jan–Jun) for idol & decoration storage', amount: '18000.00', expenseDate: d(1), createdById: treasurer?.id },
        { organizationId: mandal.id, category: 'Rent', description: 'Godown rent (Jul–Dec)', amount: '18000.00', expenseDate: d(7), createdById: treasurer?.id },
        { organizationId: mandal.id, category: 'Electricity', description: 'Mandal office electricity (annual)', amount: '6400.00', expenseDate: d(3, 15), createdById: treasurer?.id },
        { organizationId: mandal.id, category: 'Insurance', description: 'Public liability insurance', amount: '9500.00', expenseDate: d(8, 20), createdById: treasurer?.id },
        { organizationId: mandal.id, category: 'Charity & Seva', description: 'Winter blanket distribution', amount: '12000.00', expenseDate: d(1, 12), createdById: treasurer?.id },
        { organizationId: mandal.id, category: 'Printing & Publicity', description: 'Annual souvenir magazine printing', amount: '7500.00', expenseDate: d(9, 1), createdById: treasurer?.id },
      ],
    });
  }
}

async function main() {
  await seedCatalog();
  console.log('Permission catalog and system roles synced.');
  await seedBootstrapAdmin();
  // Demo accounts use a password published in the README — never on by default in production.
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true');
  if (demo === 'true') await seedDemo();
  await upgradeDemo();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
