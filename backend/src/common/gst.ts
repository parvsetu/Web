/**
 * GST on pass sales, in integer paise.
 *   CUSTOMER bears it: total = base + base × rate          (₹100 @18% → ₹118)
 *   MANDAL bears it:   price is inclusive; tax = total × rate / (1 + rate)
 *                      (₹100 @18% → ₹84.75 taxable + ₹15.25 GST)
 * Rates follow GST slabs; whether an event's admission is taxable is a CA
 * decision — the feature is off by default.
 */
export const GST_RATES_PERCENT = [0, 5, 12, 18, 28] as const;

export function computeGst(pricePaise: number, rateBps: number, bearer: 'CUSTOMER' | 'MANDAL') {
  if (rateBps <= 0 || pricePaise <= 0) return { basePaise: pricePaise, gstPaise: 0, totalPaise: pricePaise };
  if (bearer === 'CUSTOMER') {
    const gst = Math.round((pricePaise * rateBps) / 10000);
    return { basePaise: pricePaise, gstPaise: gst, totalPaise: pricePaise + gst };
  }
  const gst = Math.round((pricePaise * rateBps) / (10000 + rateBps));
  return { basePaise: pricePaise - gst, gstPaise: gst, totalPaise: pricePaise };
}
