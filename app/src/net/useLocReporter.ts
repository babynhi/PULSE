/**
 * During the countdown and the round, send my GPS position to the server every ~3 s.
 * The server uses it for the safe zone, pings, and (for infected) ally pins.
 */
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { send } from './client';

export function useLocReporter(active: boolean): { lat: number; lng: number } | null {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let last: { lat: number; lng: number; acc?: number } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled || perm.status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 2000 },
          (pos) => {
            last = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy ?? undefined };
            send('loc:report', last);
            setPos({ lat: last.lat, lng: last.lng });
          },
        );
        if (cancelled) sub.remove();
      } catch { /* no location: the server just treats us as unknown */ }
    })();
    // Re-send even when standing still, so the server's fix never goes stale.
    const timer = setInterval(() => { if (last) send('loc:report', last); }, 3000);
    return () => { cancelled = true; sub?.remove(); clearInterval(timer); };
  }, [active]);
  return pos;
}
