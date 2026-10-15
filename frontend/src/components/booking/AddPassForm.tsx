'use client';

import { useState } from 'react';
import { ClipboardPaste, Plus } from 'lucide-react';
import { BookingError, booking, cacheOrder, parsePassLink, savePass } from '@/lib/booking';
import { useT } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';
import type { SavedPass } from '@/lib/booking-types';
import { Alert, Button, Input } from '../ui';

/**
 * My passes → "Add a pass": paste a pass link received on WhatsApp / SMS /
 * email. On iPhone the home-screen app keeps its own storage, separate from
 * Safari, so this is how a pass opened elsewhere gets into the app (and its
 * offline copy).
 */
export function AddPassForm({ onAdded }: { onAdded: (p: SavedPass) => void }) {
  const { t } = useT();
  const errText = useBookingErrorText();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function add(raw: string) {
    setMsg(null);
    const link = parsePassLink(raw);
    if (!link) return setMsg({ kind: 'error', text: t('myPasses.addBad') });
    setBusy(true);
    try {
      const o = await booking.order(link.orderId, link.accessKey);
      const p: SavedPass = { orderId: o.id, accessKey: link.accessKey, eventName: o.event.name, createdAt: o.createdAt };
      savePass(p);
      cacheOrder(o);
      setText('');
      setMsg({ kind: 'success', text: t('myPasses.added', { event: o.event.name }) });
      onAdded(p);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof BookingError && e.status === 404 ? t('pass.notFound') : errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const v = await navigator.clipboard.readText();
      setText(v);
      if (parsePassLink(v)) await add(v);
    } catch {
      /* clipboard refused — the field still works */
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="h-4 w-4" /> {t('myPasses.add')}
      </Button>
    );
  }
  return (
    <form className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm" onSubmit={(e) => { e.preventDefault(); void add(text); }}>
      <label htmlFor="add-pass-link" className="text-sm font-semibold text-slate-800">{t('myPasses.addHint')}</label>
      <div className="flex gap-2">
        <Input id="add-pass-link" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/pass/…" inputMode="url" autoComplete="off" autoCapitalize="none" className="min-w-0 flex-1" />
        <Button type="button" variant="secondary" onClick={() => void paste()} aria-label={t('myPasses.paste')}>
          <ClipboardPaste aria-hidden className="h-4 w-4" /> <span className="hidden sm:inline">{t('myPasses.paste')}</span>
        </Button>
      </div>
      <Button type="submit" loading={busy} disabled={!text.trim()}>{t('myPasses.addButton')}</Button>
      {msg && <Alert kind={msg.kind === 'success' ? 'success' : 'error'}>{msg.text}</Alert>}
    </form>
  );
}
