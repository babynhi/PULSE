import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DemoSettingsProvider } from '../demo/settings';
import { party } from '../ui/fieldDay';

export default function Navigation() {
  return (
    <DemoSettingsProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: party.sky },
        headerTintColor: party.ink,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: party.paper },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="ble-lab" options={{ title: 'Game and Bluetooth Labs' }} />
        <Stack.Screen name="host" options={{ title: 'Host Game' }} />
        <Stack.Screen name="join" options={{ title: 'Join Game' }} />
        <Stack.Screen name="demo" options={{ title: 'Demo round' }} />
        <Stack.Screen name="game-settings" options={{ title: 'Game settings' }} />
      </Stack>
    </DemoSettingsProvider>
  );
}
