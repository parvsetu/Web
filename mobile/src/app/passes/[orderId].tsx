import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ApiError, errorMessage, isOffline } from '../../lib/api';
import { booking, cacheOrder, cachedOrder, orderPasses, savePass } from '../../lib/booking';
import { WEB_URL } from '../../lib/config';
import { fmtDateTime, fmtMoney, fmtPassWindow, isFree } from '../../lib/format';
import type { Pass, PassOrder } from '../../lib/types';
import { Alert, Button, C, Card, Loading, s } from '../../components/ui';

const STATUS_TEXT: Record<Pass['status'], { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Valid', color: C.green, bg: C.greenSoft },
  NOT_YET_VALID: { label: 'Not valid yet', color: C.amber, bg: C.amberSoft },
  USED: { label: 'Used', color: C.muted, bg: C.line },
  EXPIRED: { label: 'Expired', color: C.red, bg: C.redSoft },
  CANCELLED: { label: 'Cancelled', color: C.red, bg: C.redSoft },
};

function PassCard({ pass, order, index, total }: { pass: Pass; order: PassOrder; index: number; total: number }) {
  const st = STATUS_TEXT[pass.status] ?? STATUS_TEXT.ACTIVE;
  const showQr = pass.status === 'ACTIVE' || pass.status === 'NOT_YET_VALID';
  return (
    <Card style={{ alignItems: 'center', gap: 10 }}>
      {total > 1 ? (
        <Text style={s.muted}>
          Pass {index + 1} of {total}
          {pass.admits ? ` · admits ${pass.admits}` : ''}
        </Text>
      ) : null}
      <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ color: st.color, fontWeight: '700' }}>{st.label}</Text>
      </View>
      {showQr ? (
        <View accessible accessibilityLabel={`QR code for pass ${pass.tokenCode}`} style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
          <QRCode value={pass.qrPayload} size={230} ecl="M" />
        </View>
      ) : (
        <Text style={[s.muted, { textAlign: 'center', paddingVertical: 24 }]}>
          {pass.status === 'USED' && pass.usedAt ? `Used at ${fmtDateTime(pass.usedAt, order.event.timezone)}` : 'This pass can no longer be used.'}
        </Text>
      )}
      <Text selectable style={{ fontFamily: 'Menlo', fontSize: 16, fontWeight: '700', color: C.ink }}>
        {pass.tokenCode}
      </Text>
    </Card>
  );
}

export default function PassScreen() {
  const { orderId, k } = useLocalSearchParams<{ orderId: string; k: string }>();
  const [order, setOrder] = useState<PassOrder | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<'success' | 'fail' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const o = await booking.order(orderId, k);
      setOrder(o);
      setOffline(false);
      setSavedAt(null);
      await cacheOrder(o);
      await savePass({ orderId: o.id, accessKey: k, eventName: o.event.name, createdAt: o.createdAt });
    } catch (e) {
      if (isOffline(e)) {
        const c = await cachedOrder(orderId, k);
        if (c) {
          setOrder(c.order);
          setSavedAt(c.savedAt);
          setOffline(true);
          return;
        }
      }
      setError(e instanceof ApiError && e.status === 404 ? 'This pass link is not valid.' : errorMessage(e));
    }
  }, [orderId, k]);

  useEffect(() => {
    // Show the saved copy at once (gates often have no signal), then refresh.
    void cachedOrder(orderId, k).then((c) => {
      if (c) {
        setOrder((cur) => cur ?? c.order);
        setSavedAt((cur) => cur ?? c.savedAt);
      }
    });
    void load();
  }, [orderId, k, load]);

  async function demoPay(outcome: 'success' | 'fail') {
    setPaying(outcome);
    setError(null);
    try {
      const o = await booking.demoPay(orderId, k, outcome);
      setOrder(o);
      await cacheOrder(o);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPaying(null);
    }
  }

  const webLink = `${WEB_URL}/pass/${encodeURIComponent(orderId)}?k=${encodeURIComponent(k)}`;

  if (!order && error)
    return (
      <View style={s.pad}>
        <Alert>{error}</Alert>
        <Button kind="secondary" title="Retry" onPress={() => void load()} />
      </View>
    );
  if (!order) return <Loading label="Loading your pass…" />;

  const passes = orderPasses(order);
  const tz = order.event.timezone;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.pad}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <View>
        <Text style={s.h1}>{order.event.name}</Text>
        <Text style={s.muted}>
          {order.event.organization.name}
          {order.event.location ? ` · ${order.event.location}` : ''}
        </Text>
        <Text style={[s.body, { marginTop: 6, fontWeight: '600' }]}>{fmtPassWindow(order.validFrom, order.validUntil, tz)}</Text>
        <Text style={s.muted}>
          {order.programme ? order.programme.title : order.timeSlot?.label ?? ''} · {order.visitorCount} {order.visitorCount === 1 ? 'person' : 'people'} ·{' '}
          {isFree(order.amount) ? 'Free' : fmtMoney(order.amount)}
        </Text>
      </View>

      {offline && savedAt ? <Alert kind="info">No connection — showing the copy saved on {fmtDateTime(savedAt)}. The gate checks the QR online.</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {order.status === 'PAID' && passes.length === 0 ? <Alert kind="info">Your passes are being issued… pull down to refresh.</Alert> : null}
      {order.status === 'PAID' && order.refund?.cancelledAt ? (
        <Alert kind="warning">
          The organiser cancelled this booking{order.refund.reason ? `: ${order.refund.reason}` : '.'}
          {Number(order.refund.amount) > 0
            ? order.refund.state === 'SENT'
              ? ` Refund of ${fmtMoney(order.refund.amount)} sent${order.refund.reference ? ` (ref ${order.refund.reference})` : ''}.`
              : ` A refund of ${fmtMoney(order.refund.amount)} is on its way.`
            : ''}
        </Alert>
      ) : null}
      {order.status === 'FAILED' ? <Alert>The payment did not go through. No pass was issued.</Alert> : null}
      {order.status === 'EXPIRED' ? <Alert>This booking expired before payment. The places were released.</Alert> : null}
      {order.status === 'CANCELLED' ? <Alert>This booking was cancelled.</Alert> : null}

      {order.status === 'PENDING' ? (
        <Card style={{ gap: 10 }}>
          <Text style={s.h2}>Complete payment · {fmtMoney(order.amount)}</Text>
          <Text style={s.muted}>Places held until {fmtDateTime(order.expiresAt, tz)}.</Text>
          {order.payment.demo ? (
            <>
              <Alert kind="warning">Demo checkout — no real money moves.</Alert>
              <Button title="Pay (demo)" loading={paying === 'success'} disabled={!!paying} onPress={() => void demoPay('success')} />
              <Button kind="secondary" title="Simulate a failed payment" loading={paying === 'fail'} disabled={!!paying} onPress={() => void demoPay('fail')} />
            </>
          ) : (
            <Button title="Pay on the website" onPress={() => void Linking.openURL(webLink)} />
          )}
        </Card>
      ) : null}

      {passes.map((p, i) => (
        <PassCard key={p.tokenCode} pass={p} order={order} index={i} total={passes.length} />
      ))}

      {order.status === 'PAID' && passes.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <Text style={s.h2}>At the gate</Text>
          <Text style={s.body}>• Turn your screen brightness up and show the QR to the volunteer.</Text>
          <Text style={s.body}>• Each QR works once. If two people share a screenshot, only the first one in gets in.</Text>
          <Text style={s.body}>• This pass is saved on your phone and opens without signal.</Text>
          {order.event.passInstructions
            ? order.event.passInstructions
                .split('\n')
                .filter((l) => l.trim())
                .map((l, i) => (
                  <Text key={i} style={s.body}>
                    • {l.trim()}
                  </Text>
                ))
            : null}
        </Card>
      ) : null}

      <Button
        kind="secondary"
        title="Share pass link"
        onPress={() => void Share.share({ message: `My pass for ${order.event.name}: ${webLink}` })}
        accessibilityHint="Anyone with this link can open the pass. Share it only with people in your group."
      />
    </ScrollView>
  );
}
