import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

export const C = {
  brand: '#ea580c',
  brandDark: '#9a3412',
  brandSoft: '#fff7ed',
  ink: '#1c1917',
  muted: '#57534e',
  line: '#e7e5e4',
  bg: '#fafaf9',
  white: '#ffffff',
  green: '#15803d',
  greenSoft: '#dcfce7',
  red: '#b91c1c',
  redSoft: '#fee2e2',
  amber: '#b45309',
  amberSoft: '#fef3c7',
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && { backgroundColor: C.brand },
        kind === 'secondary' && { backgroundColor: C.white, borderColor: C.line, borderWidth: 1 },
        kind === 'danger' && { backgroundColor: C.red },
        off && { opacity: 0.5 },
        pressed && !off && { opacity: 0.85 },
      ]}
    >
      {loading ? <ActivityIndicator color={kind === 'secondary' ? C.ink : C.white} /> : null}
      <Text style={[s.btnText, kind === 'secondary' && { color: C.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#a8a29e"
        style={[s.input, error ? { borderColor: C.red } : null]}
        {...props}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function Alert({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'warning' | 'info' }) {
  const bg = kind === 'error' ? C.redSoft : kind === 'warning' ? C.amberSoft : C.brandSoft;
  const fg = kind === 'error' ? C.red : kind === 'warning' ? C.amber : C.brandDark;
  return (
    <View accessibilityRole="alert" style={[s.alert, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
      <ActivityIndicator color={C.brand} />
      <Text style={{ color: C.muted }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={[s.chip, selected && { backgroundColor: C.brand, borderColor: C.brand }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[{ color: C.ink, fontWeight: '600' }, selected && { color: C.white }]}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 12 },
  card: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink },
  h2: { fontSize: 18, fontWeight: '700', color: C.ink },
  body: { fontSize: 15, color: C.ink, lineHeight: 21 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, backgroundColor: C.white, color: C.ink },
  error: { color: C.red, marginTop: 4, fontSize: 13 },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnText: { color: C.white, fontSize: 16, fontWeight: '700' },
  alert: { borderRadius: 10, padding: 12 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.white, minHeight: 40, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
