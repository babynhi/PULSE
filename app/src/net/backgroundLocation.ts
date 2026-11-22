/**
 * Round-time location that keeps working with the phone locked.
 *
 * iOS keeps PULSE running in the background while it receives continuous location updates
 * (UIBackgroundModes "location" + the blue location pill). That also keeps the JS thread, the
 * socket, and the Bluetooth reporter alive, so a locked phone stays in the game.
 * Started only for the countdown + round, stopped as soon as the round ends or you leave.
 *
 * The task must be defined at app start (module scope), so this file is imported from _layout.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const ROUND_LOCATION_TASK = 'pulse-round-location';

type Fix = { lat: number; lng: number; acc?: number; speed?: number | null; course?: number | null };
const listeners = new Set<(fix: Fix) => void>();

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(ROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const pos = data.locations[data.locations.length - 1];
    const fix: Fix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      acc: pos.coords.accuracy ?? undefined,
      speed: pos.coords.speed,
      course: pos.coords.heading,
    };
    listeners.forEach((fn) => fn(fix));
  });
}

// iOS keeps a location task registered across launches. If the app was killed mid-round, stop
// the leftover tracking at launch: a new round starts its own.
if (Platform.OS !== 'web') void stopRoundLocation();

export function onRoundFix(fn: (fix: Fix) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Start background-capable updates. Asks for "Always" once (with our explanation), but works
 * with "While Using" too: iOS allows background updates started while the app was open.
 * Returns false if background updates aren't available (e.g. web, or an old build).
 */
export async function startRoundLocation(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted && bg.canAskAgain) await Location.requestBackgroundPermissionsAsync().catch(() => null);
  } catch { /* fine: "While Using" still works for a round started in the app */ }
  try {
    if (await Location.hasStartedLocationUpdatesAsync(ROUND_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(ROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 1,
      timeInterval: 2000,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopRoundLocation() {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(ROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(ROUND_LOCATION_TASK);
    }
  } catch { /* already stopped */ }
}
