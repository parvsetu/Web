import { Prisma } from '@prisma/client';

/** Moves a just-verified applicant's self-registrations into the super admin's review queue. */
export async function activateRegistrations(tx: Prisma.TransactionClient, userId: string) {
  await tx.mandalRegistration.updateMany({ where: { applicantUserId: userId, status: 'PENDING_VERIFICATION' }, data: { status: 'PENDING_REVIEW', submittedAt: new Date() } });
}
