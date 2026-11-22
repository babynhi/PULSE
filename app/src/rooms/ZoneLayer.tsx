/**
 * Things drawn on the round map: the safe zone (dashed edge and tinted exterior),
 * live pins for fellow infected, and the fading grey dots of the last 30 s ping.
 */
import { Marker, Polygon, Polyline } from 'react-native-maps';
import { Text, View } from 'react-native';
import type { AllyPos, LatLng, ZoneView } from '../../../shared/protocol';
import { party } from '../ui/fieldDay';

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Points around a circle, for the "outside the zone" tint hole. */
function ring(center: LatLng, radiusM: number, n = 72) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { latitude: center.lat + dLat * Math.sin(a), longitude: center.lng + dLng * Math.cos(a) };
  });
}

export function ZoneOverlay({ zone, flash }: { zone: ZoneView; flash: boolean }) {
  const c = zone.center;
  // A big box around the zone with the zone cut out: tints everything outside red.
  const box = 0.2;
  const outer = [
    { latitude: c.lat - box, longitude: c.lng - box },
    { latitude: c.lat - box, longitude: c.lng + box },
    { latitude: c.lat + box, longitude: c.lng + box },
    { latitude: c.lat + box, longitude: c.lng - box },
  ];
  const edge = ring(c, zone.radiusM, 120);
  return (
    <>
      <Polygon coordinates={outer} holes={[edge]} fillColor={party.orange + '36'} strokeColor="transparent" strokeWidth={1} />
      <Polyline
        coordinates={[...edge, edge[0]]}
        strokeColor={flash ? party.alert : party.ink}
        strokeWidth={flash ? 4 : 3}
        lineDashPattern={[10, 8]}
      />
    </>
  );
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function AllyPins({ allies }: { allies: AllyPos[] }) {
  return (
    <>
      {allies.map((a) => (
        <Marker key={a.id} coordinate={toMap(a)} anchor={{ x: 0.5, y: 0.5 }} title={a.name}>
          <View style={{
            width: 30, height: 30, borderRadius: 15, backgroundColor: party.orange, borderWidth: 2, borderColor: party.ink,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: party.ink, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
          }}>
            <Text style={{ color: party.ink, fontSize: 12, fontWeight: '900' }}>{initials(a.name)}</Text>
          </View>
        </Marker>
      ))}
    </>
  );
}

/** Fades from fully visible to gone over `fadeMs` after the ping. */
export function PingDots({ pings, pingAt, now, fadeMs = 25_000 }: { pings: LatLng[]; pingAt: number | null; now: number; fadeMs?: number }) {
  if (!pingAt) return null;
  const opacity = Math.max(0, 1 - (now - pingAt) / fadeMs);
  if (opacity <= 0) return null;
  return (
    <>
      {pings.map((p, i) => (
        <Marker key={`${pingAt}-${i}`} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.5 }} opacity={opacity}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: party.panel + '80', borderWidth: 1, borderColor: party.ink, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: party.muted }} />
          </View>
        </Marker>
      ))}
    </>
  );
}
