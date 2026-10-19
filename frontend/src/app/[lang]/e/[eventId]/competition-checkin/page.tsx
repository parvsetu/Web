'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type QrScannerType from 'qr-scanner';
import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { feedbackDeny, feedbackSuccess, feedbackWarn, unlockAudio } from '@/lib/feedback';
import { fmtDate } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { Alert, Button, Card, Empty, LabeledInput, LabeledSelect, SkeletonList } from '@/components/ui';
import { KIND_EMOJI, type AdminCompetition } from '@/lib/competition-types';
import { cx } from '@/lib/cx';

interface CheckInResult {
  alreadyCheckedIn: boolean;
  entry: { bibNo: number | null; participantName: string; ageOnDay: number; gender: string; category: { name: string }; heat: number | null; lane: number | null };
}

export default function CompetitionCheckInPage() {
  const ev = useEvent();
  return (
    <AppShell title="Competition check-in" subtitle={ev.name} back={`/e/${ev.eventId}`} festivalType={ev.festivalType}>
      <EventGate>
        <CheckIn />
      </EventGate>
    </AppShell>
  );
}

/** Gate volunteers / organisers: scan an entrant's QR (PVS-CMP:<entryId>) or type the bib number. */
function CheckIn() {
  const ev = useEvent();
  const q = useAsync(() => api.get<AdminCompetition[]>(`/events/${ev.eventId}/competitions`), [ev.eventId]);
  const [cid, setCid] = useState('');
  const [bib, setBib] = useState('');
  const [last, setLast] = useState<{ ok: boolean; warn?: boolean; text: string; sub?: string } | null>(null);
  const [camera, setCamera] = useState(false);
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('c');
    const list = q.data ?? [];
    if (!cid && list.length) setCid(list.find((c) => c.id === fromUrl)?.id ?? (list.length === 1 ? list[0].id : ''));
  }, [q.data, cid]);

  const checkIn = useCallback(async (body: { entryId?: string; bibNo?: number }) => {
    if (!cid || busy.current) return;
    busy.current = true;
    try {
      const r = await api.post<CheckInResult>(`/events/${ev.eventId}/competitions/${cid}/check-in`, body);
      const e = r.entry;
      const sub = `${e.category.name} · ${e.ageOnDay} y${e.heat !== null ? ` · Heat ${e.heat}, lane ${e.lane}` : ''}`;
      if (r.alreadyCheckedIn) {
        feedbackWarn();
        setLast({ ok: true, warn: true, text: `Already checked in — #${e.bibNo} ${e.participantName}`, sub });
      } else {
        feedbackSuccess();
        setLast({ ok: true, text: `#${e.bibNo} ${e.participantName}`, sub });
      }
    } catch (err) {
      feedbackDeny();
      setLast({ ok: false, text: errorMessage(err) });
    } finally {
      busy.current = false;
    }
  }, [cid, ev.eventId]);

  const onCode = useCallback((raw: string) => {
    const m = /^PVS-CMP:([0-9a-f-]{36})$/i.exec(raw.trim());
    const now = Date.now();
    if (lastCode.current && lastCode.current.code === raw && now - lastCode.current.at < 3000) return;
    lastCode.current = { code: raw, at: now };
    if (!m) {
      feedbackDeny();
      setLast({ ok: false, text: 'Not a competition entry QR. Passes are scanned on the gate scanner.' });
      return;
    }
    void checkIn({ entryId: m[1] });
  }, [checkIn]);

  if (q.loading && !q.data) return <SkeletonList />;
  if (q.error) return <Alert>{q.error}</Alert>;
  const list = q.data ?? [];
  if (!list.length) return <Empty title="No competitions" icon={ScanLine}>This festival has no competitions to check in.</Empty>;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4" onPointerDown={() => unlockAudio()}>
      <LabeledSelect label="Competition" value={cid} onChange={(e) => { setCid(e.target.value); setLast(null); }}>
        <option value="">Choose…</option>
        {list.map((c) => <option key={c.id} value={c.id}>{KIND_EMOJI[c.kind]} {c.name} · {fmtDate(c.date)} {c.startTime}</option>)}
      </LabeledSelect>
      {cid && (
        <>
          {camera ? <Camera onCode={onCode} onClose={() => setCamera(false)} /> : (
            <Button size="lg" onClick={() => setCamera(true)}><ScanLine aria-hidden className="h-5 w-5" /> Scan entry QR</Button>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); if (Number(bib)) void checkIn({ bibNo: Number(bib) }); setBib(''); }}
            className="flex items-end gap-2"
          >
            <div className="flex-1"><LabeledInput label="…or type the bib number" inputMode="numeric" value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} /></div>
            <Button type="submit" disabled={!bib}>Check in</Button>
          </form>
        </>
      )}
      {last && (
        <Card className={cx('flex items-start gap-3 border-2', !last.ok ? 'border-red-300 bg-red-50' : last.warn ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50')}>
          {last.ok ? <CheckCircle2 aria-hidden className={cx('h-8 w-8 shrink-0', last.warn ? 'text-amber-600' : 'text-emerald-600')} /> : <XCircle aria-hidden className="h-8 w-8 shrink-0 text-red-600" />}
          <div>
            <p className="text-lg font-extrabold">{last.text}</p>
            {last.sub && <p className="text-sm text-slate-700">{last.sub}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function Camera({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    let scanner: QrScannerType | null = null;
    let gone = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('The camera needs a secure (https) page on a phone with a camera. Type bib numbers instead.');
      return;
    }
    (async () => {
      const { default: QrScanner } = await import('qr-scanner');
      if (gone || !video.current) return;
      scanner = new QrScanner(video.current, (r) => cb.current(r.data), { preferredCamera: 'environment', maxScansPerSecond: 6, highlightScanRegion: true, returnDetailedScanResult: true });
      await scanner.start();
    })().catch(() => setError('Could not open the camera. Allow camera access, or type bib numbers.'));
    return () => {
      gone = true;
      scanner?.destroy();
    };
  }, []);
  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert kind="warning">{error}</Alert> : (
        <div className="overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
        </div>
      )}
      <Button variant="secondary" onClick={onClose}>Stop camera</Button>
    </div>
  );
}
