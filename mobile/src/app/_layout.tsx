import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { C } from '../components/ui';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: C.brandDark,
            headerTitleStyle: { fontWeight: '700', color: C.ink },
            headerStyle: { backgroundColor: C.white },
            headerTransparent: false,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Parvsetu' }} />
          <Stack.Screen name="festivals/index" options={{ title: 'Festivals' }} />
          <Stack.Screen name="festivals/[id]" options={{ title: 'Book a pass' }} />
          <Stack.Screen name="passes/index" options={{ title: 'My passes' }} />
          <Stack.Screen name="passes/[orderId]" options={{ title: 'Pass' }} />
          <Stack.Screen name="gate/login" options={{ title: 'Volunteer login' }} />
          <Stack.Screen name="gate/index" options={{ title: 'Gate' }} />
          <Stack.Screen name="gate/[eventId]" options={{ title: 'Scan passes', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#fff', headerTitleStyle: { color: '#fff' } }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
