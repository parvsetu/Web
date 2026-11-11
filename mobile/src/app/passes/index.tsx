import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert as RNAlert, FlatList, Pressable, Text, View } from 'react-native';
import { loadSavedPasses, parsePassLink, removeSavedPass, savePass } from '../../lib/booking';
import { fmtDateTime } from '../../lib/format';
import type { SavedPass } from '../../lib/types';
import { Alert, Button, C, Card, Field, s } from '../../components/ui';

export default function MyPasses() {
  const router = useRouter();
  const [list, setList] = useState<SavedPass[] | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void loadSavedPasses().then(setList);
  }, []);
  useFocusEffect(reload);

  const open = (p: { orderId: string; accessKey: string }) => router.push({ pathname: '/passes/[orderId]', params: { orderId: p.orderId, k: p.accessKey } });

  async function addLink() {
    const parsed = parsePassLink(link);
    if (!parsed) {
      setLinkError('Paste the full pass link you received (it contains /pass/ and ?k=).');
      return;
    }
    setLinkError(null);
    // The event name is filled in once the pass opens online.
    await savePass({ ...parsed, eventName: 'Pass', createdAt: new Date().toISOString() });
    setLink('');
    open(parsed);
  }

  function confirmRemove(p: SavedPass) {
    RNAlert.alert('Remove this pass from the phone?', 'The pass itself stays valid. You can add it again from its link.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeSavedPass(p.orderId);
          reload();
        },
      },
    ]);
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.pad}
      contentInsetAdjustmentBehavior="automatic"
      data={list ?? []}
      keyExtractor={(p) => p.orderId}
      ListHeaderComponent={
        list && list.length === 0 ? (
          <Card style={{ gap: 10 }}>
            <Text style={s.h2}>No passes on this phone yet</Text>
            <Text style={s.muted}>Passes you book here are saved automatically and open without signal.</Text>
            <Button title="Browse festivals" onPress={() => router.push('/festivals')} />
          </Card>
        ) : undefined
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the pass. Long press to remove it from this phone."
          onPress={() => open(item)}
          onLongPress={() => confirmRemove(item)}
          style={({ pressed }) => [s.card, { marginBottom: 12, flexDirection: 'row', alignItems: 'center' }, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{item.eventName}</Text>
            <Text style={s.muted}>Booked {fmtDateTime(item.createdAt)}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted }} importantForAccessibility="no">
            ›
          </Text>
        </Pressable>
      )}
      ListFooterComponent={
        <Card style={{ marginTop: 8 }}>
          <Text style={[s.h2, { marginBottom: 8 }]}>Add a pass from a link</Text>
          <Field
            label="Pass link"
            placeholder="https://…/pass/…?k=…"
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
            error={linkError}
          />
          <Button kind="secondary" title="Add pass" onPress={() => void addLink()} disabled={!link.trim()} />
          {list && list.length > 0 ? <Text style={[s.muted, { marginTop: 8 }]}>Long press a pass to remove it from this phone.</Text> : null}
        </Card>
      }
      ListEmptyComponent={list === null ? <Alert kind="info">Loading…</Alert> : undefined}
    />
  );
}
