/**
 * Online pass sales window of a festival. Null ends are open: no "opens" =
 * on sale as soon as the festival is live; no "closes" = each slot sells
 * until it ends. Desk issuing at the gate is never affected.
 */
export type SalesState = 'NOT_YET' | 'OPEN' | 'CLOSED';

export function salesState(e: { bookingOpensAt: Date | null; bookingClosesAt: Date | null }, now = new Date()): SalesState {
  if (e.bookingOpensAt && now < e.bookingOpensAt) return 'NOT_YET';
  if (e.bookingClosesAt && now >= e.bookingClosesAt) return 'CLOSED';
  return 'OPEN';
}

/** What public payloads carry about the window. */
export function presentSalesWindow(e: { bookingOpensAt: Date | null; bookingClosesAt: Date | null }, now = new Date()) {
  return { bookingOpensAt: e.bookingOpensAt, bookingClosesAt: e.bookingClosesAt, salesState: salesState(e, now) };
}
