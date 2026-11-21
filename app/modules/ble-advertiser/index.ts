import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Connects to the Swift module we just wrote (by its Name, "BleAdvertiser").
type NativeAdvertiser = { start(uuid: string): Promise<void>; stop(): void };

const native =
    Platform.OS === 'web' ? null : requireOptionalNativeModule<NativeAdvertiser>('BleAdvertiser');

// false in Expo Go or on web, true in our own dev build
export const advertiserAvailable = !!native;

export async function startAdvertising(uuid: string) {
    if (!native) throw new Error('Advertiser missing: run the dev build, not Expo Go');
    await native.start(uuid);
}

export function stopAdvertising() {
    native?.stop();
}