import { StallCategory } from '@prisma/client';

/** A PENDING booking holds its stalls this long while the vendor pays. */
export const STALL_HOLD_MINUTES = 15;
/** Stalls of one type in a single booking. */
export const MAX_STALLS_PER_BOOKING = 10;
/** Open (unpaid, unexpired) bookings one vendor may hold at a time — stops hoarding. */
export const MAX_OPEN_BOOKINGS_PER_VENDOR = 3;
export const STALL_CATEGORIES: StallCategory[] = ['FOOD', 'SHOPPING', 'SERVICES', 'EXHIBITOR', 'OTHER'];
/** GST rates a mandal can pick for stall rent. */
export const STALL_GST_PERCENTS = ['0', '5', '12', '18', '28'] as const;

/**
 * Price of a booking. GST is added on top of the rent (the vendor pays it)
 * only when the festival has GST switched on; the rate is the festival's
 * stallGstRateBps (default 18% — stall/space rent is usually 18%, but this is
 * a placeholder for the mandal's CA to confirm). The platform fee is a share
 * of the rent before GST, so it never touches the tax the mandal remits.
 */
export function quoteStalls(i: { unitPricePaise: number; quantity: number; gstOn: boolean; gstRateBps: number; commissionBps: number }) {
  const basePaise = i.unitPricePaise * i.quantity;
  const gstRateBps = i.gstOn && basePaise > 0 ? i.gstRateBps : 0;
  const gstPaise = Math.round((basePaise * gstRateBps) / 10000);
  const platformFeePaise = Math.min(basePaise, Math.round((basePaise * i.commissionBps) / 10000));
  return { basePaise, gstRateBps, gstPaise, amountPaise: basePaise + gstPaise, platformFeePaise };
}
