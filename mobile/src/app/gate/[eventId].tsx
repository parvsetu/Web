/*
 * Gate scanner — same rules as the web scanner (frontend/.../e/[eventId]/scan):
 *  - ENTRY ALLOWED is shown ONLY for a 200 response with success=true and
 *    result=SUCCESS. Anything else (network error, timeout, 5xx, malformed
 *    response) is "Unable to verify" — never inferred success.
 *  - Every physical scan gets one idempotencyKey; automatic and manual retries
 *    of that same scan reuse it, so the server replays rather than double-counts.
 *  - There is deliberately NO override button anywhere on this screen.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, request } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, fmtTime } from '../../lib/format';
import type { ScanResponse } from '../../lib/types';
import { Button, C, Loading, s } from '../../components/ui';

const REQUEST_TIMEOUT_MS = 8000;
const AUTO_RETRIES = 2;
const SAME_CODE_DEBOUNCE_MS = 4000;
const SUCCESS_AUTO_RETURN_MS = 4000;

type ScanBody = { eventId: string; idempotencyKey: string } & ({ qrPayload: string } | { tokenCode: string });

type Phase =
  | { kind: 'scanning' }
  | { kind: 'verifying'; attempt: number }
  | { kind: 'result'; res: ScanResponse }
  | { kind: 'network'; detail: string }
  | { kind: 'rejected'; message: string; retryable: boolean } // 400 / 404 / 409 / 429 — not a verdict
  | { kind: 'unauthorized'; message: string };

function isScanResponse(x: unknown): x is ScanResponse {
  return !!x && typeof x === 'object' && typeof (x as ScanResponse).result === 'string' && typeof (x as ScanResponse).success === 'boolean';
}

export default function ScanScreen() {
  useKeepAwake(); // volunteers hold the phone up for long stretches
  const { eventId, name } = useLocalSearchParams<{ eventId: string; name?: string }>();
  const navigation = useNavigation();
  // Only one camera preview may run at a time: unmount it when the screen loses focus.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { user, loading } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhaseState] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const phaseRef = useRef<Phase>({ kind: 'scanning' });
  const pendingRef = useRef<ScanBody | null>(null);
  const lastPayloadRef = useRef<{ value: string; at: number } | null>(null);
  const inFlightRef = useRef(false);

  const ev = user?.events.find((e) => e.id === eventId);
  const manualAllowed = !!user && (user.isSuperAdmin || !!ev?.permissions.includes('TOKEN_MANUAL_ENTRY'));

  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

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
            const res = await request<unknown>('POST', '/tokens/scan', { body, auth: true, timeoutMs: REQUEST_TIMEOUT_MS });
            if (!isScanResponse(res)) {
              lastDetail = 'Unexpected response from the server.'; // a 200 we can't understand is NOT a verdict
              break;
            }
            pendingRef.current = null;
            setPhase({ kind: 'result', res });
            if (res.success === true && res.result === 'SUCCESS') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
          } catch (e) {
            if (e instanceof ApiError && e.status > 0) {
              if (e.status === 403) {
                pendingRef.current = null;
                const body403 = (e as ApiError & { body?: { message?: string } }).body;
                setPhase({ kind: 'unauthorized', message: body403?.message || e.message });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                return;
              }
              if (e.status === 401) {
                // Session expired — the token is cleared and the screen redirects to login.
                pendingRef.current = null;
                return;
              }
              if (e.status === 429) {
                // Rate limited: keep the pending key so "Retry" replays the SAME scan.
                setPhase({ kind: 'rejected', message: e.message, retryable: true });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                return;
              }
              if (e.status < 500) {
                // 400 / 404 / 409 IDEMPOTENCY_KEY_REUSED — not a verdict. Discard the key.
                pendingRef.current = null;
                if (e.status === 409) lastPayloadRef.current = null; // allow an immediate rescan of the same QR
                setPhase({ kind: 'rejected', message: e.message, retryable: false });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                return;
              }
              lastDetail = e.message; // 5xx: retry with the same key (idempotent)
            } else if (e instanceof ApiError) {
              lastDetail = e.timedOut ? 'The server took too long to respond.' : 'No connection to the server.';
            } else {
              lastDetail = 'Unknown error.';
            }
          }
          if (attempt < AUTO_RETRIES) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
        setPhase({ kind: 'network', detail: lastDetail });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } finally {
        inFlightRef.current = false;
      }
    },
    [setPhase],
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (phaseRef.current.kind !== 'scanning' || inFlightRef.current || !data) return;
      const last = lastPayloadRef.current;
      if (last && last.value === data && Date.now() - last.at < SAME_CODE_DEBOUNCE_MS) return;
      lastPayloadRef.current = { value: data, at: Date.now() };
      void send({ eventId, qrPayload: data, idempotencyKey: Crypto.randomUUID() });
    },
    [eventId, send],
  );

  const scanNext = useCallback(() => {
    pendingRef.current = null;
    setPhase({ kind: 'scanning' });
  }, [setPhase]);

  const retry = useCallback(() => {
    const p = pendingRef.current;
    if (p) void send(p); // SAME idempotency key
    else scanNext();
  }, [send, scanNext]);

  // After a successful entry, go back to scanning on its own.
  useEffect(() => {
    if (phase.kind === 'result' && phase.res.success && phase.res.result === 'SUCCESS') {
      const t = setTimeout(scanNext, SUCCESS_AUTO_RETURN_MS);
      return () => clearTimeout(t);
    }
  }, [phase, scanNext]);

  function submitManual() {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    setManualOpen(false);
    setManualCode('');
    void send({ eventId, tokenCode: code, idempotencyKey: Crypto.randomUUID() });
  }

  if (loading) return <Loading />;
  if (!user) return <Redirect href="/gate/login" />;

  if (!permission) return <Loading label="Checking camera permission…" />;
  if (!permission.granted)
    return (
      <View style={[s.pad, { flex: 1, justifyContent: 'center' }]}>
        <Text style={s.h2}>Camera needed</Text>
        <Text style={s.muted}>Parvsetu uses the camera only to read pass QR codes at the gate.</Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
        )}
        {manualAllowed ? <Button kind="secondary" title="Type a pass code instead" onPress={() => setManualOpen(true)} /> : null}
        <ManualModal open={manualOpen} code={manualCode} setCode={setManualCode} onClose={() => setManualOpen(false)} onSubmit={submitManual} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={phase.kind === 'scanning' ? onScanned : undefined}
        />
      ) : null}

      {phase.kind === 'scanning' ? (
        <View style={st.overlay} pointerEvents="box-none">
          <View style={st.frame} accessibilityLabel="Point the camera at the pass QR code" accessible />
          <Text style={st.hint}>Point at the pass QR</Text>
          <View style={[s.row, { gap: 12, marginTop: 'auto', marginBottom: 32 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'} onPress={() => setTorch((t) => !t)} style={st.round}>
              <Text style={st.roundText}>{torch ? 'Torch off' : 'Torch'}</Text>
            </Pressable>
            {manualAllowed ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Type a pass code" onPress={() => setManualOpen(true)} style={st.round}>
                <Text style={st.roundText}>Type code</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <ResultPanel phase={phase} tz={ev?.timezone ?? 'Asia/Kolkata'} onNext={scanNext} onRetry={retry} />
      )}

      <ManualModal open={manualOpen} code={manualCode} setCode={setManualCode} onClose={() => setManualOpen(false)} onSubmit={submitManual} />
    </View>
  );
}

function ResultPanel({ phase, tz, onNext, onRetry }: { phase: Exclude<Phase, { kind: 'scanning' }>; tz: string; onNext: () => void; onRetry: () => void }) {
  if (phase.kind === 'verifying')
    return (
      <View style={[st.panel, { backgroundColor: '#1c1917' }]}>
        <Loading label={phase.attempt > 0 ? `Verifying… (retry ${phase.attempt})` : 'Verifying…'} />
      </View>
    );

  if (phase.kind === 'result') {
    const r = phase.res;
    const ok = r.success === true && r.result === 'SUCCESS';
    const used = r.result === 'ALREADY_USED';
    return (
      <View style={[st.panel, { backgroundColor: ok ? C.green : used ? C.amber : C.red }]} accessibilityLiveRegion="assertive">
        <Text style={st.big}>{ok ? 'ENTRY ALLOWED' : used ? 'ALREADY USED' : 'ENTRY DENIED'}</Text>
        <Text style={st.msg}>{r.message}</Text>
        {r.tokenCode ? <Text style={st.detail}>{r.tokenCode}</Text> : null}
        {ok && r.visitorCount ? <Text style={st.huge}>{r.visitorCount === 1 ? '1 person' : `${r.visitorCount} people`}</Text> : null}
        {r.timeSlot ? <Text style={st.detail}>{r.timeSlot.label}</Text> : null}
        {used && r.usedAt ? (
          <Text style={st.detail}>
            Used at {fmtDateTime(r.usedAt, tz)}
            {r.scannedBy ? ` by ${r.scannedBy.name}` : ''}
          </Text>
        ) : null}
        {(r.result === 'EXPIRED' || r.result === 'NOT_YET_VALID') && r.validFrom && r.validUntil ? (
          <Text style={st.detail}>
            Valid {fmtDateTime(r.validFrom, tz)} – {fmtTime(r.validUntil, tz)}
          </Text>
        ) : null}
        {r.replayed ? <Text style={st.detail}>(Same scan as before — not counted twice.)</Text> : null}
        <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
          <Button kind="secondary" title="Scan next" onPress={onNext} />
        </View>
      </View>
    );
  }

  if (phase.kind === 'network')
    return (
      <View style={[st.panel, { backgroundColor: '#44403c' }]} accessibilityLiveRegion="assertive">
        <Text style={st.big}>UNABLE TO VERIFY</Text>
        <Text style={st.msg}>Do not let the visitor in on this scan. Check your connection and retry.</Text>
        {phase.detail ? <Text style={st.detail}>{phase.detail}</Text> : null}
        <View style={{ marginTop: 16, gap: 10, alignSelf: 'stretch' }}>
          <Button title="Retry this scan" onPress={onRetry} />
          <Button kind="secondary" title="Cancel" onPress={onNext} />
        </View>
      </View>
    );

  if (phase.kind === 'rejected')
    return (
      <View style={[st.panel, { backgroundColor: '#44403c' }]} accessibilityLiveRegion="assertive">
        <Text style={st.big}>NOT VERIFIED</Text>
        <Text style={st.msg}>{phase.message}</Text>
        <View style={{ marginTop: 16, gap: 10, alignSelf: 'stretch' }}>
          {phase.retryable ? <Button title="Retry" onPress={onRetry} /> : null}
          <Button kind="secondary" title="Scan again" onPress={onNext} />
        </View>
      </View>
    );

  return (
    <View style={[st.panel, { backgroundColor: C.red }]} accessibilityLiveRegion="assertive">
      <Text style={st.big}>NOT ALLOWED</Text>
      <Text style={st.msg}>{phase.message || 'You cannot scan for this festival.'}</Text>
    </View>
  );
}

function ManualModal({ open, code, setCode, onClose, onSubmit }: { open: boolean; code: string; setCode: (v: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={[s.pad, { backgroundColor: C.white, borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
          <Text style={s.h2}>Type the pass code</Text>
          <Text style={s.muted}>The code printed under the QR, e.g. GAN-2026-000582.</Text>
          <TextInput
            accessibilityLabel="Pass code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            style={s.input}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
          <Button title="Verify" onPress={onSubmit} disabled={!code.trim()} />
          <Button kind="secondary" title="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', paddingTop: 60 },
  frame: { width: 250, height: 250, borderWidth: 4, borderColor: '#fff', borderRadius: 20 },
  hint: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
  round: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  roundText: { color: '#fff', fontWeight: '700' },
  panel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  big: { color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center' },
  huge: { color: '#fff', fontSize: 40, fontWeight: '900', marginTop: 8 },
  msg: { color: '#fff', fontSize: 18, textAlign: 'center' },
  detail: { color: '#fff', fontSize: 15, textAlign: 'center', opacity: 0.9 },
});
