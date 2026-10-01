/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
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

const DEMO_PASSWORD = 'Parvsetu@123';

async function seedDemo() {
  if (await prisma.organization.findUnique({ where: { slug: 'shree-durga-mandal' } })) {
    console.log('Demo data already present — skipping (delete the demo orgs to reseed).');
    return;
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const role = async (key: string) => (await prisma.role.findFirstOrThrow({ where: { organizationId: null, key } })).id;
  const user = (name: string, mobile: string, email: string, isSuperAdmin = false) =>
    prisma.user.create({ data: { name, mobile, email, passwordHash: hash, isSuperAdmin } });

  const superAdmin = await user('Platform Admin', '9000000001', 'super@parvsetu.dev', true);
  const admin = await user('Ananya Sen', '9000000002', 'admin@parvsetu.dev');
  const gate = await user('Rahul Das', '9000000003', 'gate@parvsetu.dev');
  const desk = await user('Priya Roy', '9000000004', 'desk@parvsetu.dev');
  const viewer = await user('Sanjay Ghosh', '9000000005', 'viewer@parvsetu.dev');
  const treasurer = await user('Meera Bose', '9000000006', 'treasurer@parvsetu.dev');
  const otherAdmin = await user('Kiran Patel', '9000000007', 'navratri-admin@parvsetu.dev');
  const applicant = await user('Arjun Mehta', '9000000008', 'applicant@parvsetu.dev');

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

  // A few Durga Puja tokens: some used today, one cancelled, the rest open.
  const slots = await prisma.timeSlot.findMany({ where: { eventId: durga.id }, orderBy: { sortOrder: 'asc' } });
  let seq = 0;
  const now = new Date();
  for (const slot of slots) {
    const from = DateTime.fromISO(`${today.toISODate()}T${slot.startTime}`, { zone: tz });
    const until = DateTime.fromISO(`${today.toISODate()}T${slot.endTime}`, { zone: tz });
    for (let i = 0; i < 8; i++) {
      seq++;
      const ended = until.toJSDate() <= now;
      const used = ended ? i < 6 : i < 2 && from.toJSDate() <= now;
      const token = await prisma.token.create({
        data: {
          eventId: durga.id, tokenCode: `DUR-${today.year}-${String(seq).padStart(6, '0')}`, secureToken: randomBytes(16).toString('base64url'),
          timeSlotId: slot.id, visitorCount: 1 + (i % 3), validFrom: from.toJSDate(), validUntil: until.toJSDate(), issuedById: desk.id,
          status: used ? 'USED' : i === 7 ? 'CANCELLED' : 'ACTIVE',
          usedAt: used ? from.plus({ minutes: 10 + i * 7 }).toJSDate() : null, usedById: used ? gate.id : null,
          cancelledAt: !used && i === 7 ? now : null, cancelledById: !used && i === 7 ? admin.id : null,
          cancellationReason: !used && i === 7 ? 'Duplicate booking' : null,
        },
      });
      if (used) {
        await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: gate.id, result: 'SUCCESS', scanTime: token.usedAt! } });
        if (i === 0) await prisma.scanLog.create({ data: { tokenId: token.id, eventId: durga.id, userId: gate.id, result: 'ALREADY_USED', scanTime: from.plus({ minutes: 40 }).toJSDate() } });
      }
    }
  }
  await prisma.event.update({ where: { id: durga.id }, data: { tokenSeq: seq } });

  const donations = [
    ['Ravi Chatterjee', '5001.00', 'CASH'], ['Sunita Mukherjee', '2100.00', 'UPI'], ['Local Traders Assn.', '25000.00', 'BANK_TRANSFER'],
  ] as const;
  for (const [i, [donorName, amount, method]] of donations.entries()) {
    await prisma.donation.create({
      data: {
        eventId: durga.id, donorName, amount, method, paymentStatus: 'SUCCESS', paymentProvider: 'manual',
        receiptNo: `DUR-R-${today.year}-${String(i + 1).padStart(5, '0')}`, createdById: treasurer.id,
      },
    });
  }
  await prisma.event.update({ where: { id: durga.id }, data: { donationReceiptSeq: donations.length } });
  await prisma.expense.createMany({
    data: [
      { eventId: durga.id, category: 'Decoration', description: 'Pandal lighting', amount: '12000.00', expenseDate: d(today.minus({ days: 1 })), vendor: 'Bright Lights Co.', createdById: treasurer.id },
      { eventId: durga.id, category: 'Bhog', description: 'Prasad ingredients', amount: '4500.00', expenseDate: d(today), createdById: treasurer.id },
    ],
  });

  console.log(`
Demo data created. Password for every demo account: ${DEMO_PASSWORD}
  super admin        9000000001  super@parvsetu.dev
  mandal admin       9000000002  admin@parvsetu.dev          (Shree Durga Mandal)
  gate volunteer     9000000003  gate@parvsetu.dev           (Durga Puja: scan only)
  token desk         9000000004  desk@parvsetu.dev           (Durga Puja: issue + scan)
  report viewer      9000000005  viewer@parvsetu.dev
  treasurer          9000000006  treasurer@parvsetu.dev
  other mandal admin 9000000007  navratri-admin@parvsetu.dev (Navratri Seva Samiti — isolated)
  pending applicant  9000000008  applicant@parvsetu.dev
super admin id: ${superAdmin.id}`);
}

async function main() {
  await seedCatalog();
  console.log('Permission catalog and system roles synced.');
  if (process.env.SEED_DEMO !== 'false') await seedDemo();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
