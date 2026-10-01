'use client';

import { FileText, Receipt } from 'lucide-react';
import { cx } from './ui';

export type PrintFormat = 'A4' | 'THERMAL_80' | 'THERMAL_58';

export const PRINT_FORMATS: { key: PrintFormat; label: string; hint: string }[] = [
  { key: 'A4', label: 'A4 page', hint: 'Office / home printer' },
  { key: 'THERMAL_80', label: 'Thermal 80 mm', hint: 'POS receipt printer' },
  { key: 'THERMAL_58', label: 'Thermal 58 mm', hint: 'Small handheld printer' },
];

/**
 * Print-only CSS for passes. Wrap each ticket in `.pass-print`; one pass per
 * page/strip. A4 centres a 120 mm ticket; thermal formats print a narrow,
 * black-on-white strip with a large QR (thermal heads can't print colour).
 */
export function PrintFormatStyle({ format }: { format: PrintFormat }) {
  const css =
    format === 'A4'
      ? `@page { size: A4; margin: 12mm; }
         .pass-print { width: 120mm; margin: 0 auto 8mm; break-inside: avoid; page-break-after: always; }
         .pass-print:last-child { page-break-after: auto; }`
      : // Thermal rolls feed continuously; an explicit page length is required ("auto" is invalid CSS).
        `@page { size: ${format === 'THERMAL_80' ? '80mm 240mm' : '58mm 200mm'}; margin: 2mm; }
         html, body { width: ${format === 'THERMAL_80' ? '76mm' : '54mm'} !important; background: #fff !important; }
         .pass-print { width: ${format === 'THERMAL_80' ? '76mm' : '54mm'}; margin: 0; page-break-after: always; font-size: ${format === 'THERMAL_80' ? '11px' : '9px'}; }
         .pass-print:last-child { page-break-after: auto; }
         .pass-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; border-color: #000 !important; }
         .pass-print img[alt^="QR"] { width: ${format === 'THERMAL_80' ? '62mm' : '46mm'} !important; height: auto !important; }
         .pass-print .rounded-3xl, .pass-print .rounded-2xl, .pass-print .rounded-full { border-radius: 0 !important; }
         .pass-print .thermal-hide, .pass-print svg[aria-hidden="true"] { display: none !important; }
         .pass-print header, .pass-print section, .pass-print dl, .pass-print > div { padding: 1.5mm !important; margin: 0 !important; }
         .pass-print p, .pass-print dd, .pass-print dt { margin: 0 !important; line-height: 1.25 !important; }`;
  return <style media="print">{css}</style>;
}

/** Small segmented control to choose the print layout before printing. */
export function PrintFormatPicker({ value, onChange }: { value: PrintFormat; onChange: (f: PrintFormat) => void }) {
  return (
    <div className="no-print grid grid-cols-3 gap-2" role="radiogroup" aria-label="Print format">
      {PRINT_FORMATS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={value === f.key}
          onClick={() => onChange(f.key)}
          className={cx(
            'flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-1 text-xs font-semibold',
            value === f.key ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-400' : 'border-orange-200 bg-white',
          )}
        >
          {f.key === 'A4' ? <FileText aria-hidden className="h-4 w-4" /> : <Receipt aria-hidden className="h-4 w-4" />}
          {f.label}
          <span className="font-normal text-slate-500">{f.hint}</span>
        </button>
      ))}
    </div>
  );
}
