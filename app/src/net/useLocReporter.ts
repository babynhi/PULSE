/**
 * During the countdown and the round, send my GPS position to the server every ~3 s.
 * The server uses it for the safe zone, pings, and (for infected) ally pins.
 *
 * Uses background-capable location updates (see backgroundLocation.ts) so this keeps running
 * with the phone locked; falls back to a foreground-only watcher if that isn't available.
 */
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { send } from './client';
import { onRoundFix, startRoundLocation, stopRoundLocation } from './backgroundLocation';
import type { LatLng } from '../../../shared/protocol';

export type PlayerPosition = LatLng & { speed?: number | null; course?: number | null };

export function useLocReporter(active: boolean): PlayerPosition | null {
  const [pos, setPos] = useState<PlayerPosition | null>(null);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let last: { lat: number; lng: number; acc?: number } | null = null;
    let cancelled = false;
    const report = (fix: PlayerPosition & { acc?: number }) => {
      if (cancelled) return;
      last = { lat: fix.lat, lng: fix.lng, acc: fix.acc };
      send('loc:report', last);
      setPos({ lat: fix.lat, lng: fix.lng, speed: fix.speed, course: fix.course });
    };
    const off = onRoundFix(report);
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled || perm.status !== 'granted') return;
        if (await startRoundLocation()) return;
        // No background mode in this build: foreground-only updates.
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 2000 },
          (p) => report({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? undefined,
            speed: p.coords.speed, course: p.coords.heading }),
        );
        if (cancelled) sub.remove();
      } catch { /* no location: the server just treats us as unknown */ }
    })();
    // Re-send even when standing still, so the server's fix never goes stale.
    const timer = setInterval(() => { if (last) send('loc:report', last); }, 3000);
    return () => {
      cancelled = true;
      off();
      sub?.remove();
      clearInterval(timer);
      void stopRoundLocation();
      setPos(null);
    };
  }, [active]);
  return active ? pos : null;
}
