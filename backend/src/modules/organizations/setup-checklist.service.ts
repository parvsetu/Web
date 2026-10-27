import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/auth/request-user';

export type ChecklistLink = { kind: 'org'; tab: string } | { kind: 'event'; eventId: string; tab: string };

export interface ChecklistStep {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  optional: boolean;
  /** Short state for steps that wait on someone else (payout review, festival review). */
  status?: string;
  link: ChecklistLink;
}

/**
 * "Get your mandal ready" — the first-login checklist for a mandal admin. Every
 * step is worked out from the data each time (nothing stored but the person's
 * "hide" choice), so it can't drift from what the mandal actually set up.
 * Steps follow the go-live order: profile → bank → festival → slots → review
 * and fee → Active → team; online booking and sponsors are optional extras.
 */
@Injectable()
export class SetupChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: RequestUser, orgId: string) {
    const [org, payout, events, members, assignments, sponsors, member] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { logoKey: true, address: true, city: true } }),
      this.prisma.payoutAccount.findUnique({ where: { organizationId: orgId }, select: { status: true } }),
      this.prisma.event.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, status: true, approvalStatus: true, publicBookingEnabled: true, _count: { select: { timeSlots: { where: { isActive: true } } } } },
      }),
      this.prisma.organizationMember.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.eventAssignment.count({ where: { event: { organizationId: orgId }, status: 'ACTIVE' } }),
      this.prisma.sponsor.count({ where: { organizationId: orgId } }),
      this.prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: user.id } }, select: { setupChecklistDismissedAt: true } }),
    ]);

    // The festival the steps point at: the newest one still being run (else the newest at all).
    const live = events.filter((e) => e.status !== 'CANCELLED');
    const focus = live[0] ?? events[0] ?? null;
    const eventLink = (tab: string): ChecklistLink => (focus ? { kind: 'event', eventId: focus.id, tab } : { kind: 'org', tab: 'events' });
    const review = focus?.approvalStatus ?? null;
    const reviewHint: Record<string, string> = {
      DRAFT: 'Open the festival and submit it for platform review.',
      SUBMITTED: 'Submitted — the Parvsetu team is reviewing it.',
      CHANGES_REQUESTED: 'The reviewer asked for changes. Fix them and submit again.',
      APPROVED_AWAITING_PAYMENT: 'Approved — pay the registration fee to go live.',
      REJECTED: 'This festival was not approved. Read the reviewer’s note on the festival.',
      LIVE: 'Your festival is live.',
    };
    const payoutHint: Record<string, string> = {
      PENDING: 'Submitted — waiting for verification by Parvsetu.',
      NEEDS_CORRECTION: 'Parvsetu asked for a correction. Open Payouts & bank to fix it.',
      REJECTED: 'Not accepted. Open Payouts & bank to see why and submit again.',
      VERIFIED: 'Verified — online payments reach this account.',
    };

    const steps: ChecklistStep[] = [
      {
        key: 'profile', title: 'Add your mandal’s logo and address', optional: false,
        hint: 'Shown on passes, receipts and your festival pages.',
        done: !!org.logoKey && !!(org.address || org.city), link: { kind: 'org', tab: 'settings' },
      },
      {
        key: 'payout', title: 'Add your bank account for payouts', optional: false,
        hint: payout ? payoutHint[payout.status] : 'Needed before visitors can pay online — ticket money is paid out to this account.',
        status: payout?.status ?? 'NOT_STARTED', done: payout?.status === 'VERIFIED', link: { kind: 'org', tab: 'payouts' },
      },
      {
        key: 'festival', title: 'Create your first festival', optional: false,
        hint: focus ? `${focus.name} is set up.` : 'Name, dates, venue and festival type.',
        done: events.length > 0, link: { kind: 'org', tab: 'events' },
      },
      {
        key: 'slots', title: 'Add entry time slots and prices', optional: false,
        hint: 'Every pass is valid for a time slot. Price 0 = free entry.',
        done: events.some((e) => e._count.timeSlots > 0), link: eventLink('slots'),
      },
      {
        key: 'review', title: 'Submit the festival for review and pay the fee', optional: false,
        hint: review ? reviewHint[review] : 'Create a festival first.',
        status: review ?? 'NOT_STARTED', done: events.some((e) => e.approvalStatus === 'LIVE'), link: { kind: 'org', tab: 'events' },
      },
      {
        key: 'active', title: 'Make the festival Active', optional: false,
        hint: 'Passes can be issued and scanned only while the festival is Active.',
        done: events.some((e) => e.status === 'ACTIVE' || e.status === 'COMPLETED'), link: eventLink('settings'),
      },
      {
        key: 'team', title: 'Add your team', optional: false,
        hint: 'Add members (treasurer, desk, gate) or assign volunteers to the festival.',
        done: members > 1 || assignments > 0, link: { kind: 'org', tab: 'members' },
      },
      {
        key: 'booking', title: 'Turn on online pass booking', optional: true,
        hint: 'Visitors book and pay on your festival page.',
        done: events.some((e) => e.publicBookingEnabled), link: eventLink('settings'),
      },
      {
        key: 'sponsors', title: 'Add your sponsors', optional: true,
        hint: 'Their logos print on passes, free for the mandal.',
        done: sponsors > 0, link: { kind: 'org', tab: 'sponsors' },
      },
    ];
    const required = steps.filter((s) => !s.optional);
    return {
      steps,
      done: steps.filter((s) => s.done).length, total: steps.length,
      /** Every required step done. */
      complete: required.every((s) => s.done),
      dismissed: !!member?.setupChecklistDismissedAt,
      /** Only members can hide it for themselves (a super admin helping out sees it as is). */
      canDismiss: !!member,
    };
  }

  async setDismissed(user: RequestUser, orgId: string, dismissed: boolean) {
    const r = await this.prisma.organizationMember.updateMany({
      where: { organizationId: orgId, userId: user.id },
      data: { setupChecklistDismissedAt: dismissed ? new Date() : null },
    });
    if (r.count !== 1) throw new BadRequestException('Only members of this mandal can hide its checklist.');
    return this.get(user, orgId);
  }
}
