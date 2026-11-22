import type { LatLng } from '../../../shared/protocol';

const METERS_PER_DEGREE = 111_320;
const longitudeScale = (lat: number) => METERS_PER_DEGREE * Math.cos(lat * Math.PI / 180);

/** A north-up local plot, in meters east and south of the origin. */
export function offsetFrom(origin: LatLng, point: LatLng) {
  const longitudeDelta = (point.lng - origin.lng + 540) % 360 - 180;
  return { x: longitudeDelta * longitudeScale(origin.lat), y: (origin.lat - point.lat) * METERS_PER_DEGREE };
}

export function zoneRing(center: LatLng, radiusM: number, count: number) {
  const dLat = radiusM / METERS_PER_DEGREE;
  const dLng = radiusM / longitudeScale(center.lat);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI;
    return { latitude: center.lat + dLat * Math.sin(angle), longitude: center.lng + dLng * Math.cos(angle) };
  });
}

export const allyInitials = (name: string) => name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();

export function pingOpacity(pingAt: number | null, now: number, fadeMs = 25_000) {
  return pingAt === null ? 0 : Math.max(0, Math.min(1, 1 - (now - pingAt) / fadeMs));
}

/** Linear fade from 1 to 0 over `lifeMs` after `at`. */
export function markOpacity(at: number, now: number, lifeMs: number) {
  return Math.max(0, Math.min(1, 1 - (now - at) / lifeMs));
}

/** "12s ago", "1m 5s ago": how stale a delayed ping is. */
export function agoLabel(at: number, now: number) {
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  return sec < 60 ? sec + 's ago' : Math.floor(sec / 60) + 'm ' + (sec % 60) + 's ago';
}

export type Keyed = LatLng & { key: string };

function metersBetween(a: LatLng, b: LatLng) {
  const { x, y } = offsetFrom(a, b);
  return Math.hypot(x, y);
}

/**
 * Pings are anonymous, so to glide a dot from its last spot to its new one we pair each new
 * ping with the nearest unclaimed previous dot (within maxM). Unpaired pings get fresh keys.
 */
export function matchPings(prev: Keyed[], next: LatLng[], newKey: () => string, maxM = 60): Keyed[] {
  const pairs: { i: number; j: number; d: number }[] = [];
  next.forEach((n, i) => prev.forEach((p, j) => {
    const d = metersBetween(p, n);
    if (d <= maxM) pairs.push({ i, j, d });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const keys: (string | undefined)[] = new Array(next.length);
  const used = new Set<number>();
  for (const { i, j } of pairs) {
    if (keys[i] !== undefined || used.has(j)) continue;
    keys[i] = prev[j].key;
    used.add(j);
  }
  return next.map((n, i) => ({ key: keys[i] ?? newKey(), lat: n.lat, lng: n.lng }));
}

/** Eased position along a glide from `from` to `to` that started at `at` and lasts `ms`. */
export function glideAt(track: { from: LatLng; to: LatLng; at: number }, now: number, ms: number): LatLng {
  const t = Math.max(0, Math.min(1, (now - track.at) / ms));
  const e = t * t * (3 - 2 * t);
  return { lat: track.from.lat + (track.to.lat - track.from.lat) * e, lng: track.from.lng + (track.to.lng - track.from.lng) * e };
}
