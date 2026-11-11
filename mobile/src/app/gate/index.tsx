import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { isLive, scannableEvents, useAuth } from '../../lib/auth';
import { festivalTypeLabel } from '../../lib/format';
import { Button, C, Card, Loading, s } from '../../components/ui';

export default function Gate() {
  const router = useRouter();
  const { loading, user, logout, refresh } = useAuth();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (loading) return <Loading />;
  if (!user) return <Redirect href="/gate/login" />;

  const events = scannableEvents(user);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} contentInsetAdjustmentBehavior="automatic">
      <Text style={s.muted}>Signed in as {user.name}</Text>
      {events.length === 0 ? (
        <Card style={{ gap: 6 }}>
          <Text style={s.h2}>No festivals to scan yet</Text>
          <Text style={s.muted}>Ask your mandal admin to assign you to a festival with the scanning role, then pull this screen again.</Text>
        </Card>
      ) : (
        events.map((e) => {
          const live = isLive(e);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: !live }}
              onPress={live ? () => router.push({ pathname: '/gate/[eventId]', params: { eventId: e.id, name: e.name } }) : undefined}
              style={({ pressed }) => [s.card, !live && { opacity: 0.6 }, pressed && live && { opacity: 0.85 }]}
            >
              <Text style={{ color: C.brandDark, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>{festivalTypeLabel(e.festivalType)}</Text>
              <Text style={s.h2}>{e.name}</Text>
              <Text style={s.muted}>{e.organization.name}</Text>
              <View style={[s.row, { marginTop: 6 }]}>
                <Text style={{ fontWeight: '700', color: live ? C.green : C.amber }}>{live ? 'Tap to scan' : 'Not live yet — scanning opens once the festival is approved'}</Text>
              </View>
            </Pressable>
          );
        })
      )}
      <Button kind="secondary" title="Sign out" onPress={() => void logout().then(() => router.replace('/'))} />
    </ScrollView>
  );
}
