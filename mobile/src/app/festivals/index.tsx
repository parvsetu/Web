import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { errorMessage } from '../../lib/api';
import { booking } from '../../lib/booking';
import { fmtMoney, festivalTypeLabel, isFree } from '../../lib/format';
import type { BookableEvent } from '../../lib/types';
import { Alert, Button, C, Field, Loading, s } from '../../components/ui';

function dateRange(a: string, b: string) {
  const f = (d: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
  return a.slice(0, 10) === b.slice(0, 10) ? f(a) : `${f(a)} – ${f(b)}`;
}

export default function Festivals() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<BookableEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (query: string) => {
    const mine = ++seq.current;
    setError(null);
    try {
      const list = await booking.events({ q: query.trim() || undefined });
      if (mine === seq.current) setItems(list);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.pad}
      contentInsetAdjustmentBehavior="automatic"
      data={items ?? []}
      keyExtractor={(e) => e.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load(q);
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <Field label="Search festivals" placeholder="Name, mandal or city" value={q} onChangeText={setQ} returnKeyType="search" autoCorrect={false} />
          {error ? (
            <View style={{ gap: 8 }}>
              <Alert>{error}</Alert>
              <Button kind="secondary" title="Retry" onPress={() => void load(q)} />
            </View>
          ) : null}
          {!items && !error ? <Loading label="Loading festivals… the server may take a minute to wake up." /> : null}
        </View>
      }
      ListEmptyComponent={items && !error ? <Text style={[s.muted, { textAlign: 'center', padding: 24 }]}>No festivals are taking bookings right now.</Text> : undefined}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/festivals/[id]', params: { id: item.id } })}
          style={({ pressed }) => [s.card, { marginBottom: 12 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={{ color: C.brandDark, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>{festivalTypeLabel(item.festivalType)}</Text>
          <Text style={[s.h2, { marginTop: 2 }]}>{item.name}</Text>
          <Text style={s.muted}>
            {item.organization.name}
            {item.city ? ` · ${item.city}` : ''}
          </Text>
          <View style={[s.row, { marginTop: 8, justifyContent: 'space-between' }]}>
            <Text style={s.body}>{dateRange(item.startDate, item.endDate)}</Text>
            {item.fromPrice !== null ? (
              <Text style={{ fontWeight: '700', color: C.ink }}>{isFree(item.fromPrice) ? 'Free' : `from ${fmtMoney(item.fromPrice)}`}</Text>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}
