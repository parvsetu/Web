import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { C, s } from '../components/ui';

function Tile({ title, sub, emoji, onPress }: { title: string; sub: string; emoji: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [s.card, { flexDirection: 'row', gap: 14, alignItems: 'center' }, pressed && { opacity: 0.85 }]}
    >
      <Text style={{ fontSize: 32 }} importantForAccessibility="no">
        {emoji}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={s.h2}>{title}</Text>
        <Text style={s.muted}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 22, color: C.muted }} importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} contentInsetAdjustmentBehavior="automatic">
      <View style={{ paddingVertical: 8 }}>
        <Text style={s.h1}>Festival passes, made simple</Text>
        <Text style={[s.muted, { marginTop: 4 }]}>Book an entry pass, keep it on your phone, and show the QR at the gate — even without signal.</Text>
      </View>
      <Tile emoji="🎪" title="Browse festivals" sub="Find a festival and book a pass" onPress={() => router.push('/festivals')} />
      <Tile emoji="🎟️" title="My passes" sub="Passes saved on this phone, work offline" onPress={() => router.push('/passes')} />
      <Tile
        emoji="📷"
        title="Gate volunteer"
        sub={user ? `Signed in as ${user.name}` : 'Sign in to scan passes at the gate'}
        onPress={() => router.push(user ? '/gate' : '/gate/login')}
      />
    </ScrollView>
  );
}
