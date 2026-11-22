/**
 * Danger alerts while the phone is locked or PULSE is in the background: local notifications
 * with sound + vibration. When the app is open, the in-app UI (red pulse, banners) does the job,
 * so nothing is shown in the foreground. Rate-limited per kind so a long chase doesn't spam.
 */
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type AlertKind = 'danger' | 'infected' | 'someoneInfected' | 'cured' | 'eliminated' | 'zoneWarning' | 'outsideZone';

const MIN_GAP_MS: Record<AlertKind, number> = {
  danger: 20_000,
  infected: 0,
  someoneInfected: 3_000,
  cured: 0,
  eliminated: 0,
  zoneWarning: 15_000,
  outsideZone: 8_000,
};
const lastSent = new Map<AlertKind, number>();
let ready: Promise<boolean> | null = null;

Notifications.setNotificationHandler({
  // Foreground: the in-app UI already shows it.
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Ask once (at round start). Returns whether alerts can be shown. */
export function prepareAlerts(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  ready ??= (async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
      return asked.granted;
    } catch {
      return false;
    }
  })();
  return ready;
}

export function isBackground() {
  return AppState.currentState !== 'active';
}

/** Show a lock-screen alert, but only when PULSE isn't on screen. */
export async function alertInBackground(kind: AlertKind, title: string, body: string) {
  if (Platform.OS === 'web' || !isBackground()) return;
  const now = Date.now();
  if (now - (lastSent.get(kind) ?? 0) < MIN_GAP_MS[kind]) return;
  if (!(await prepareAlerts())) return;
  lastSent.set(kind, now);
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', interruptionLevel: 'active' },
      trigger: null,
    });
  } catch { /* alerts are best effort */ }
}
