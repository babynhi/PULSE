import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DemoSettingsProvider } from '../demo/settings';

export default function Navigation() {
  return (
    <DemoSettingsProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#101518' },
        headerTintColor: '#F2F5ED',
        contentStyle: { backgroundColor: '#101518' },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="tutorial" options={{ title: 'How to Play' }} />
        <Stack.Screen name="ble-lab" options={{ title: 'Game and Bluetooth Labs' }} />
        <Stack.Screen name="host" options={{ title: 'Host Game' }} />
        <Stack.Screen name="join" options={{ title: 'Join Game' }} />
        <Stack.Screen name="room" options={{ title: 'Lobby', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="round" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="demo" options={{ title: 'Demo round' }} />
        <Stack.Screen name="game-settings" options={{ title: 'Game settings' }} />
      </Stack>
    </DemoSettingsProvider>
  );
}
