import { router, Stack } from 'expo-router';
import { HeaderBackButton } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { DemoSettingsProvider } from '../demo/settings';
import { fieldStyles, party } from '../ui/fieldDay';
import { fieldHeaderOptions, headerActionTarget } from '../ui/HeaderAction';

export const unstable_settings = { anchor: 'index' };

export default function Navigation() {
  return (
    <DemoSettingsProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{
        ...fieldHeaderOptions,
        headerLeft: Platform.OS === 'web' ? ({ canGoBack, href, label }) => canGoBack &&
          <HeaderBackButton href={href} label={label} displayMode="generic" tintColor={party.ink}
            labelStyle={fieldStyles.label} style={headerActionTarget} onPress={() => router.back()} /> : undefined,
        contentStyle: { backgroundColor: party.paper },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="ble-lab" options={{ title: 'Game and Bluetooth Labs' }} />
        <Stack.Screen name="host" options={{ title: 'Host a game' }} />
        <Stack.Screen name="join" options={{ title: 'Join a game' }} />
        <Stack.Screen name="room" options={{ title: 'Lobby', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="round" options={{ title: 'Round', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="demo" options={{ title: 'Round preview' }} />
        <Stack.Screen name="game-settings" options={{ title: 'Game settings' }} />
      </Stack>
    </DemoSettingsProvider>
  );
}
