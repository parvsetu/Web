'use client';

import { useEffect, useState } from 'react';
import { useFestivalTypes, useIndianStates } from '@/lib/catalog';
import { humanize } from '@/lib/format';
import { Input, LabeledSelect } from './ui';

const OTHER = '__other__';

/**
 * State → City picker for India. State comes from the fixed list; the city
 * list fills from the chosen state, with "Other…" for any town not listed.
 */
export function StateCityPicker({
  state,
  city,
  onChange,
  required,
}: {
  state: string;
  city: string;
  onChange: (v: { state: string; city: string }) => void;
  required?: boolean;
}) {
  const states = useIndianStates();
  const list = states.data ?? [];
  const cities = list.find((s) => s.name === state)?.cities ?? [];
  const known = !city || cities.includes(city);
  const [other, setOther] = useState(!known);
  useEffect(() => setOther(!!city && !!state && cities.length > 0 && !cities.includes(city)), [state, cities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <LabeledSelect label={required ? 'State' : 'State (optional)'} value={state} onChange={(e) => onChange({ state: e.target.value, city: '' })}>
        <option value="">— Select state —</option>
        <optgroup label="States">
          {list.filter((s) => s.type === 'STATE').map((s) => (
            <option key={s.code} value={s.name}>{s.name}</option>
          ))}
        </optgroup>
        <optgroup label="Union Territories">
          {list.filter((s) => s.type === 'UT').map((s) => (
            <option key={s.code} value={s.name}>{s.name}</option>
          ))}
        </optgroup>
      </LabeledSelect>
      <div className="flex flex-col gap-2">
        <LabeledSelect
          label="City"
          value={other ? OTHER : city}
          disabled={!state}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOther(true);
              onChange({ state, city: '' });
            } else {
              setOther(false);
              onChange({ state, city: e.target.value });
            }
          }}
        >
          <option value="">{state ? '— Select city —' : 'Select a state first'}</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {state && <option value={OTHER}>Other (type it)…</option>}
        </LabeledSelect>
        {other && (
          <Input aria-label="City name" autoFocus placeholder="Type your town / city" value={city} maxLength={100} onChange={(e) => onChange({ state, city: e.target.value })} />
        )}
      </div>
    </div>
  );
}

/** Festival type dropdown grouped by tradition, with the usual months as a hint. */
export function FestivalTypeSelect({ value, onChange, label = 'Festival type' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const types = useFestivalTypes();
  const list = types.data ?? [];
  const groups = [...new Set(list.map((t) => t.group))];
  const sel = list.find((t) => t.key === value);
  return (
    <LabeledSelect label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={sel?.months ? `Usually: ${sel.months}` : undefined}>
      <option value="">— Choose —</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {list.filter((t) => t.group === g).map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </optgroup>
      ))}
      {value && list.length > 0 && !sel && <option value={value}>{humanize(value)}</option>}
    </LabeledSelect>
  );
}
