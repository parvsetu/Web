import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text } from 'react-native';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { WEB_URL } from '../../lib/config';
import { Alert, Button, Field, s } from '../../components/ui';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!identifier.trim() || !password) {
      setError('Enter your mobile or email and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      router.replace('/gate');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <Text style={s.muted}>For volunteers and mandal staff who scan passes at the gate. Visitors don't need to sign in.</Text>
        <Field
          label="Mobile or email"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {error ? <Alert>{error}</Alert> : null}
        <Button title="Sign in" loading={busy} onPress={() => void submit()} />
        <Button kind="secondary" title="Forgot password?" onPress={() => void Linking.openURL(`${WEB_URL}/forgot-password`)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
