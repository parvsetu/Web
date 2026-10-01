'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Megaphone, Printer } from 'lucide-react';
import { useEvent } from '@/lib/event-context';
import { QrImage } from '../QrImage';
import { ShareButtons } from '../ShareButtons';
import { Alert, Card, SectionTitle } from '../ui';

/** Organiser tools to promote the festival: public link, share buttons, poster, printable QR. */
export function PromoteTab() {
  const ev = useEvent();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/f/${ev.eventId}`;
  const isPublic = ev.status === 'ACTIVE' || ev.status === 'COMPLETED';

  return (
    <div className="flex flex-col gap-4">
      {!isPublic && (
        <Alert kind="warning">The public page goes live when the festival is Active. Change the status in Settings when you are ready to promote it.</Alert>
      )}
      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Megaphone}>Your festival page</SectionTitle>
        <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-orange-700">
            Open <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
        </div>
        <p className="text-sm text-slate-600">
          Shows your dates, timings, partners and a &ldquo;Book passes&rdquo; button. When shared on WhatsApp, Facebook or X it displays a festive preview card.
        </p>
        {origin && <ShareButtons url={url} text={`🙏 ${ev.name} — ${ev.organization?.name ?? ''}`} posterUrl={`/f/${ev.eventId}/poster`} posterName={ev.name.replace(/[^\w-]+/g, '-')} />}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col items-center gap-2">
          <h3 className="font-bold">Instagram / WhatsApp status poster</h3>
          {isPublic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/f/${ev.eventId}/poster`} alt="Festival poster" className="w-full max-w-xs rounded-2xl shadow" />
          ) : (
            <p className="text-sm text-slate-500">Available once the festival is Active.</p>
          )}
        </Card>
        <Card className="flex flex-col items-center gap-2 print-break-inside-avoid">
          <h3 className="font-bold">QR for posters &amp; the pandal entrance</h3>
          <p className="text-center text-xs text-slate-500">Visitors scan it to open the festival page and book passes.</p>
          {origin && <QrImage payload={url} size={240} alt="QR code for the festival page" />}
          <p className="text-center text-sm font-semibold">{ev.name}</p>
          <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-orange-200 px-4 font-semibold">
            <Printer aria-hidden className="h-4 w-4" /> Print
          </button>
        </Card>
      </div>
    </div>
  );
}
