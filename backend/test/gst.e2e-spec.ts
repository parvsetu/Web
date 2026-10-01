/** GST on online passes: customer- vs mandal-borne, invoices, report, GSTIN requirement, print format. */
import { bearer, bootApp, makeOrgWithEvent, TestCtx, verifyPayouts } from './helpers';

describe('GST on passes (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  async function setup() {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    const slot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', auth).send({ label: 'Day', startTime: '00:00', endTime: '23:59', price: 100 });
    const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const buy = async () => {
      const o = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: slot.body.id, date, visitorCount: 1, buyerName: 'Meena', buyerMobile: '9811111111' });
      return (await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' })).body;
    };
    return { ...m, auth, buy };
  }

  it('GST needs the mandal GSTIN; customer-borne GST is added on top', async () => {
    const m = await setup();
    const on = await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ publicBookingEnabled: true, gstEnabled: true, gstRatePercent: 18, gstBearer: 'CUSTOMER' });
    expect(on.body.code).toBe('GSTIN_REQUIRED');
    await ctx.prisma.payoutAccount.update({ where: { organizationId: m.org.id }, data: { gstin: '27AAATS1234Z1Z5' } });
    const ok = await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ publicBookingEnabled: true, gstEnabled: true, gstRatePercent: 18, gstBearer: 'CUSTOMER', passPrintFormat: 'THERMAL_80' });
    expect(ok.body).toMatchObject({ gstEnabled: true, gstRatePercent: 18, gstBearer: 'CUSTOMER', passPrintFormat: 'THERMAL_80' });
    const paid = await m.buy();
    expect(paid).toMatchObject({ amount: '118.00', gst: { taxable: '100.00', amount: '18.00', cgst: '9.00', sgst: '9.00', ratePercent: 18 }, printFormat: 'THERMAL_80', issuer: { gstin: '27AAATS1234Z1Z5' } });
    expect(paid.invoiceNo).toMatch(/-INV-\d{4}-00001$/);
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/settlements`)).set('Authorization', m.auth);
    expect(st.body.items[0]).toMatchObject({ gross: '118.00', gst: '18.00', commission: '1.00', net: '117.00' });
  });

  it('mandal-borne GST is carved out of the price; GST report totals', async () => {
    const m = await setup();
    await ctx.prisma.payoutAccount.update({ where: { organizationId: m.org.id }, data: { gstin: '27AAATS1234Z1Z5' } });
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ publicBookingEnabled: true, gstEnabled: true, gstRatePercent: 18, gstBearer: 'MANDAL' });
    const paid = await m.buy();
    expect(paid).toMatchObject({ amount: '100.00', gst: { taxable: '84.75', amount: '15.25', bearer: 'MANDAL' } });
    await m.buy();
    const rep = await ctx.http().get(api(`/events/${m.event.id}/reports/gst`)).set('Authorization', m.auth);
    expect(rep.body.totals).toMatchObject({ orders: 2, taxable: '169.50', gst: '30.50', total: '200.00' });
    expect(rep.body.invoices.map((i: { invoiceNo: string }) => i.invoiceNo)).toHaveLength(2);
    const csv = await ctx.http().get(api(`/events/${m.event.id}/reports/gst?format=csv`)).set('Authorization', m.auth);
    expect(csv.text.split('\n')[0]).toContain('invoiceNo');
  });
});
