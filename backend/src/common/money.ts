import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Accepts 1500, "1500", "1500.5", "1500.50" → "1500.50"-style decimal string. */
export function MoneyField() {
  return function (target: object, key: string) {
    Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))(target, key);
    Matches(/^(?!0+(\.0+)?$)\d{1,10}(\.\d{1,2})?$/, { message: `${key} must be a positive amount with at most 2 decimals` })(target, key);
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** Indian numbering (lakh/crore), e.g. 125050.50 → "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only". */
export function amountInWords(amount: string | number): string {
  const [r, p = '0'] = String(amount).split('.');
  let n = Number(r);
  const paise = Number(p.padEnd(2, '0').slice(0, 2));
  if (n === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${belowThousand(crore)} Crore`); // amounts are capped at 10 digits → crore < 1000
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  const rupees = parts.length ? `${parts.join(' ')} Rupees` : '';
  const ps = paise ? `${belowHundred(paise)} Paise` : '';
  return `${[rupees, ps].filter(Boolean).join(' and ')} Only`;
}
