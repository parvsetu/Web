'use client';

/*
 * Gate scanner. The server is the only authority on a scan verdict:
 *  - ENTRY ALLOWED is shown ONLY for a 200 response with success=true and
 *    result=SUCCESS. Anything else (network error, timeout, 5xx, malformed
 *    response) is shown as "Unable to verify token" — never inferred success.
 *  - Every physical scan gets one idempotencyKey; automatic and manual retries
 *    of that same scan reuse it, so the server replays rather than double-counts.
 *  - There is deliberately NO override button anywhere on this screen.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type QrScannerType from 'qr-scanner';
import { ApiError, NetworkError, api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { feedbackDeny, feedbackSuccess, feedbackWarn, unlockAudio } from '@/lib/feedback';
import { fmtDateTime, fmtTime, newIdempotencyKey } from '@/lib/format';
import { useOnline } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { ScanResponse } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { ArrowLeft, CheckCircle2, Flashlight, FlashlightOff, Keyboard, Loader2, RefreshCw, ScanLine, ShieldAlert, ShieldX, WifiOff, XCircle } from 'lucide-react';
import { Button, Input, Modal, cx } from '@/components/ui';

const REQUEST_TIMEOUT_MS = 8000;
const AUTO_RETRIES = 2;
const SAME_CODE_DEBOUNCE_MS = 4000;
const SUCCESS_AUTO_RETURN_S = 4;

type ScanBody = { eventId: string; idempotencyKey: string } & ({ qrPayload: string } | { tokenCode: string });

type Phase =
  | { kind: 'scanning' }
  | { kind: 'verifying'; attempt: number }
  | { kind: 'result'; res: ScanResponse }
  | { kind: 'network'; detail: string }
  | { kind: 'rejected'; message: string; retryable: boolean } // 400 / 404 / 429 — not a verdict
  | { kind: 'unauthorized'; message: string };

type CameraState = 'starting' | 'on' | 'denied' | 'insecure' | 'nocamera' | 'error';

function isScanResponse(x: unknown): x is ScanResponse {
  return !!x && typeof x === 'object' && typeof (x as ScanResponse).result === 'string' && typeof (x as ScanResponse).success === 'boolean';
}

export default function ScanPage() {
  const ev = useEvent();
  const online = useOnline();
  return (
    <AppShell
      festivalType={ev.festivalType}
      title="Scan QR Token"
      subtitle={ev.name}
      back={`/e/${ev.eventId}`}
      bare
      right={
        <span
          className={cx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
            online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
          )}
          role="status"
        >
          <span className={cx('h-2 w-2 rounded-full', online ? 'bg-green-600' : 'bg-red-600')} />
          {online ? 'Online' : 'Offline'}
        </span>
      }
    >
      <div className="p-4">
        <EventGate anyOf={['TOKEN_SCAN']}>
          <Scanner />
        </EventGate>
      </div>
    </AppShell>
  );
}

function Scanner() {
  const ev = useEvent();
  const online = useOnline();
  const manualAllowed = can(ev.perms, 'TOKEN_MANUAL_ENTRY');

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const phaseRef = useRef<Phase>({ kind: 'scanning' });
  const [phase, setPhaseState] = useState<Phase>({ kind: 'scanning' });
  const [camera, setCamera] = useState<CameraState>('starting');
  const [cameraMsg, setCameraMsg] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const pendingRef = useRef<ScanBody | null>(null);
  const lastPayloadRef = useRef<{ value: string; at: number } | null>(null);
  const inFlightRef = useRef(false);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ---- Camera lifecycle ----
  const startCamera = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.start();
      setCamera('on');
      s.hasFlash()
        .then(setHasTorch)
        .catch(() => setHasTorch(false));
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|permission/i.test(msg)) setCamera('denied');
      else if (name === 'NotFoundError' || /not found/i.test(msg)) setCamera('nocamera');
      else {
        setCamera('error');
        setCameraMsg(msg || name);
      }
    }
  }, []);

  const pauseCamera = useCallback(() => {
    void scannerRef.current?.pause().catch(() => undefined);
  }, []);

  // ---- Submitting a scan (with retries on the SAME idempotency key) ----
  const send = useCallback(
    async (body: ScanBody) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      pendingRef.current = body;
      let lastDetail = '';
      try {
        for (let attempt = 0; attempt <= AUTO_RETRIES; attempt++) {
          setPhase({ kind: 'verifying', attempt });
          try {
            const res = await api.post<unknown>('/tokens/scan', body, { timeoutMs: REQUEST_TIMEOUT_MS });
            if (!isScanResponse(res)) {
              // A 200 we can't understand is NOT a verdict.
              lastDetail = 'Unexpected response from server.';
              break;
            }
            pendingRef.current = null;
            setPhase({ kind: 'result', res });
            if (res.success === true && res.result === 'SUCCESS') feedbackSuccess();
            else feedbackDeny();
            return;
          } catch (e) {
            if (e instanceof ApiError) {
              if (e.status === 403) {
                pendingRef.current = null;
                setPhase({ kind: 'unauthorized', message: e.message });
                feedbackDeny();
                scannerRef.current?.stop();
                return;
              }
              if (e.status === 401) {
                // Session expired — the API client is already redirecting to /login.
                pendingRef.current = null;
                return;
              }
              if (e.status === 429) {
                // Rate limited: keep the pending key so "Retry" replays the SAME scan.
                setPhase({ kind: 'rejected', message: e.message, retryable: true });
                feedbackWarn();
                return;
              }
              if (e.status < 500) {
                // 400 / 404 / 409 IDEMPOTENCY_KEY_REUSED etc. — not a verdict.
                // Discard this key; the next scan always gets a fresh one.
                pendingRef.current = null;
                if (e.status === 409) lastPayloadRef.current = null; // allow an immediate rescan of the same QR
                setPhase({ kind: 'rejected', message: e.message, retryable: false });
                feedbackWarn();
                return;
              }
              // 5xx: server trouble — retry with the same key (idempotent).
              lastDetail = e.message;
            } else if (e instanceof NetworkError) {
              lastDetail = e.timedOut ? 'The server took too long to respond.' : 'No connection to the server.';
            } else {
              lastDetail = 'Unknown error.';
            }
          }
          if (attempt < AUTO_RETRIES) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
        setPhase({ kind: 'network', detail: lastDetail });
        feedbackWarn();
      } finally {
        inFlightRef.current = false;
      }
    },
    [setPhase],
  );

  const onDecode = useCallback(
    (data: string) => {
      if (phaseRef.current.kind !== 'scanning' || inFlightRef.current) return;
      const last = lastPayloadRef.current;
      if (last && last.value === data && Date.now() - last.at < SAME_CODE_DEBOUNCE_MS) return;
      lastPayloadRef.current = { value: data, at: Date.now() };
      pauseCamera();
      void send({ eventId: ev.eventId, qrPayload: data, idempotencyKey: newIdempotencyKey() });
    },
    [ev.eventId, pauseCamera, send],
  );

  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  useEffect(() => {
    let destroyed = false;
    let instance: QrScannerType | null = null;
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCamera('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('nocamera');
      return;
    }
    (async () => {
      const { default: QrScanner } = await import('qr-scanner');
      if (destroyed || !videoRef.current) return;
      instance = new QrScanner(videoRef.current, (r) => onDecodeRef.current(r.data), {
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      });
      scannerRef.current = instance;
      await startCamera();
    })().catch(() => setCamera('error'));
    return () => {
      destroyed = true;
      instance?.destroy();
      scannerRef.current = null;
    };
  }, [startCamera]);

  // Audio on iOS needs a user gesture; unlock on the first tap anywhere.
  useEffect(() => {
    const h = () => unlockAudio();
    document.addEventListener('pointerdown', h, { passive: true });
    return () => document.removeEventListener('pointerdown', h);
  }, []);

  const scanNext = useCallback(() => {
    unlockAudio();
    pendingRef.current = null;
    // Re-arm debounce from now, so a QR still held in front of the camera
    // isn't immediately submitted again.
    if (lastPayloadRef.current) lastPayloadRef.current = { ...lastPayloadRef.current, at: Date.now() };
    setPhase({ kind: 'scanning' });
    setTorchOn(scannerRef.current?.isFlashOn() ?? false);
    if (camera === 'on' || camera === 'starting') void startCamera();
  }, [camera, setPhase, startCamera]);

  const retry = useCallback(() => {
    unlockAudio();
    const body = pendingRef.current;
    if (body) void send(body); // same idempotencyKey
    else scanNext();
  }, [send, scanNext]);

  async function toggleTorch() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.toggleFlash();
      setTorchOn(s.isFlashOn());
    } catch {
      setHasTorch(false);
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    setManualOpen(false);
    setManualCode('');
    pauseCamera();
    void send({ eventId: ev.eventId, tokenCode: code, idempotencyKey: newIdempotencyKey() });
  }

  if (phase.kind === 'unauthorized') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-red-50 p-6 text-center ring-2 ring-red-300">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600">
          <ShieldX aria-hidden className="h-11 w-11" />
        </span>
        <h2 className="text-2xl font-extrabold text-red-800">You are not authorized to scan for this event</h2>
        <p className="text-red-900">{phase.message}</p>
        <p className="text-sm text-slate-700">Please ask your mandal organiser to give you scanning access.</p>
        <Link href={`/e/${ev.eventId}`} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white">
          <ArrowLeft aria-hidden className="h-5 w-5" /> Go back
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ev.status && ev.status !== 'ACTIVE' && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert aria-hidden className="h-4 w-4 shrink-0" /> This festival is not Active, so the server will refuse scans.
        </div>
      )}
      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          <WifiOff aria-hidden className="h-4 w-4 shrink-0" /> You are offline. Tokens cannot be verified without internet.
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl bg-black shadow-xl ring-4 ring-orange-200" style={{ aspectRatio: '3 / 4', maxHeight: '62dvh', width: '100%' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {camera !== 'on' && <CameraProblem state={camera} detail={cameraMsg} onRetry={() => void startCamera()} />}
        {camera === 'on' && phase.kind === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-center text-lg font-bold text-white">
            Point the camera at the QR code
          </div>
        )}
        {hasTorch && camera === 'on' && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torchOn}
            className={cx(
              'absolute right-3 top-3 flex h-12 min-w-[48px] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold',
              torchOn ? 'bg-yellow-300 text-black' : 'bg-black/60 text-white',
            )}
          >
            {torchOn ? <Flashlight aria-hidden className="h-5 w-5" /> : <FlashlightOff aria-hidden className="h-5 w-5" />}
            {torchOn ? 'Light on' : 'Light'}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-center text-2xl font-extrabold tracking-wide text-slate-900">
        <ScanLine aria-hidden className="h-7 w-7 text-emerald-600" />
        {phase.kind === 'verifying' ? 'Verifying…' : 'Scan QR Token'}
      </div>

      {manualAllowed && (
        <Button
          variant="secondary"
          onClick={() => {
            unlockAudio();
            setManualOpen(true);
          }}
          disabled={phase.kind !== 'scanning'}
        >
          <Keyboard aria-hidden className="h-5 w-5" /> Enter code manually
        </Button>
      )}

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Enter token code">
        <form onSubmit={submitManual} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Type the code printed under the QR, for example GAN-2026-000582.</p>
          <Input
            autoFocus
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xl uppercase tracking-wider"
            placeholder="CODE-YYYY-000000"
          />
          <Button type="submit" size="lg" disabled={!manualCode.trim()}>
            Verify code
          </Button>
        </form>
      </Modal>

      {phase.kind !== 'scanning' && <ResultOverlay phase={phase} tz={ev.timezone} onNext={scanNext} onRetry={retry} />}
    </div>
  );
}

function CameraProblem({ state, detail, onRetry }: { state: CameraState; detail: string; onRetry: () => void }) {
  if (state === 'starting')
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-lg font-semibold text-white">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" /> Starting camera…
      </div>
    );
  const content: Record<Exclude<CameraState, 'starting' | 'on'>, { title: string; body: React.ReactNode }> = {
    denied: {
      title: 'Camera permission is blocked',
      body: (
        <ol className="list-decimal space-y-1 pl-5 text-left">
          <li>Tap the lock / “aA” icon next to the website address.</li>
          <li>Set Camera to “Allow”.</li>
          <li>On iPhone: Settings → Safari → Camera → Allow.</li>
          <li>Then tap “Try again” below.</li>
        </ol>
      ),
    },
    insecure: {
      title: 'Camera needs a secure (https) link',
      body: 'Open Parvsetu using its https:// address. Cameras do not work on plain http links.',
    },
    nocamera: { title: 'No camera found', body: 'This device has no usable camera. Use a phone with a rear camera.' },
    error: { title: 'Camera could not start', body: detail || 'Close other apps using the camera and try again.' },
  };
  const c = content[state as keyof typeof content];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-white">
      <div className="text-xl font-bold">{c.title}</div>
      <div className="text-sm text-slate-200">{c.body}</div>
      {state !== 'insecure' && state !== 'nocamera' && (
        <button type="button" onClick={onRetry} className="mt-2 flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-6 font-semibold text-slate-900">
          <RefreshCw aria-hidden className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/25 py-2 last:border-0">
      <span className="text-base opacity-90">{label}</span>
      <span className="text-right text-lg font-bold">{value}</span>
    </div>
  );
}

function ResultOverlay({ phase, tz, onNext, onRetry }: { phase: Exclude<Phase, { kind: 'scanning' } | { kind: 'unauthorized' }>; tz: string; onNext: () => void; onRetry: () => void }) {
  const isSuccess = phase.kind === 'result' && phase.res.success === true && phase.res.result === 'SUCCESS';
  const [countdown, setCountdown] = useState(SUCCESS_AUTO_RETURN_S);

  useEffect(() => {
    if (!isSuccess) return;
    setCountdown(SUCCESS_AUTO_RETURN_S);
    const iv = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(iv);
  }, [isSuccess, phase]);
  useEffect(() => {
    if (isSuccess && countdown <= 0) onNext();
  }, [isSuccess, countdown, onNext]);

  if (phase.kind === 'verifying') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-900/90 p-6 text-white" role="status" aria-live="assertive">
        <Loader2 aria-hidden className="h-16 w-16 animate-spin text-amber-300" />
        <div className="text-2xl font-bold">Verifying token…</div>
        {phase.attempt > 0 && <div className="text-base text-slate-300">Retrying ({phase.attempt} of {AUTO_RETRIES})…</div>}
      </div>
    );
  }

  if (phase.kind === 'network' || phase.kind === 'rejected') {
    const network = phase.kind === 'network';
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-amber-400 to-amber-500 p-6 pt-safe text-black" role="alert" aria-live="assertive">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-black/10">
            {network ? <WifiOff aria-hidden className="h-16 w-16" /> : <ShieldAlert aria-hidden className="h-16 w-16" />}
          </span>
          <h2 className="text-3xl font-extrabold">{network ? 'Unable to verify token' : 'Could not verify'}</h2>
          <p className="text-xl font-semibold">
            {network ? 'Unable to verify token. Please check your internet connection.' : phase.message}
          </p>
          {network && phase.detail && <p className="text-base opacity-80">{phase.detail}</p>}
          <p className="text-base font-bold">Do NOT allow entry until the token is verified.</p>
        </div>
        <div className="flex flex-col gap-3 pb-safe">
          {network || phase.retryable ? (
            <button type="button" onClick={onRetry} className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-black text-xl font-bold text-white">
              <RefreshCw aria-hidden className="h-6 w-6" /> Retry
            </button>
          ) : null}
          {network || phase.retryable ? (
            <button type="button" onClick={onNext} className="min-h-[56px] rounded-2xl bg-white/80 text-lg font-bold">
              Cancel — scan again
            </button>
          ) : (
            <button type="button" onClick={onNext} className="min-h-[64px] rounded-2xl bg-black text-xl font-bold text-white">
              Scan again
            </button>
          )}
        </div>
      </div>
    );
  }

  const r = phase.res;
  const invalid = r.result === 'INVALID';
  const bg = isSuccess ? 'bg-gradient-to-b from-green-500 to-emerald-700' : 'bg-gradient-to-b from-red-500 to-rose-700';
  const heading = isSuccess ? 'ENTRY ALLOWED' : invalid ? 'INVALID TOKEN' : 'ENTRY DENIED';
  const ResultIcon = isSuccess ? CheckCircle2 : XCircle;
  const visitors = r.visitorCount ?? 1;

  return (
    <div className={cx('fixed inset-0 z-50 flex flex-col overflow-y-auto p-6 pt-safe text-white', bg)} role="alert" aria-live="assertive">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <span className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/40">
          <ResultIcon aria-hidden className="h-20 w-20" strokeWidth={2.5} />
        </span>
        <h2 className="text-center text-4xl font-black leading-tight tracking-tight sm:text-5xl">{heading}</h2>
        <p className="text-center text-xl font-semibold">{r.message}</p>
        {isSuccess && visitors > 1 && (
          <div className="mx-auto rounded-2xl bg-white px-6 py-3 text-center text-3xl font-black text-green-700">Admit {visitors} people</div>
        )}
        {r.replayed && <p className="text-center text-sm font-semibold opacity-90">(Same scan confirmed again — not counted twice.)</p>}
        <div className="mx-auto w-full max-w-md rounded-2xl bg-black/15 px-4 py-2">
          {r.tokenCode && <Row label="Token" value={<span className="font-mono">{r.tokenCode}</span>} />}
          {isSuccess && (
            <>
              <Row label="Status" value={r.status ?? 'USED'} />
              <Row label="Scanned at" value={fmtTime(r.usedAt ?? r.scannedAt, tz)} />
              {r.scannedBy && <Row label="Scanned by" value={r.scannedBy.name} />}
              <Row label="Visitors" value={visitors} />
              {r.timeSlot && <Row label="Slot" value={r.timeSlot.label} />}
            </>
          )}
          {r.result === 'ALREADY_USED' && (
            <>
              <Row label="Used at" value={fmtDateTime(r.usedAt, tz)} />
              {r.scannedBy && <Row label="Scanned by" value={r.scannedBy.name} />}
            </>
          )}
          {r.result === 'EXPIRED' && <Row label="Valid until" value={fmtDateTime(r.validUntil, tz)} />}
          {r.result === 'NOT_YET_VALID' && <Row label="Valid from" value={fmtDateTime(r.validFrom, tz)} />}
          {!isSuccess && r.timeSlot && <Row label="Slot" value={r.timeSlot.label} />}
        </div>
      </div>
      <div className="pb-safe pt-4">
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className={cx('flex min-h-[72px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-2xl font-black', isSuccess ? 'text-green-700' : 'text-red-700')}
        >
          <ScanLine aria-hidden className="h-7 w-7" />
          Scan next{isSuccess && countdown > 0 ? ` (${countdown})` : ''}
        </button>
      </div>
    </div>
  );
}
