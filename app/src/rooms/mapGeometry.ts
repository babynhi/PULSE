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
