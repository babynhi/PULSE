import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function Navigation() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#101518' },
        headerTintColor: '#F2F5ED',
        contentStyle: { backgroundColor: '#101518' },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="tutorial" options={{ title: 'How to Play' }} />
        <Stack.Screen name="ble-lab" options={{ title: 'Bluetooth Lab' }} />
        <Stack.Screen name="host" options={{ title: 'Host Game' }} />
        <Stack.Screen name="join" options={{ title: 'Join Game' }} />
      </Stack>
    </>
  );
}
