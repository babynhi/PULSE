/**
 * Things drawn on the round map: the safe zone (dark dotted edge + red tint outside),
 * live pins for fellow infected, and the fading grey dots of the last 30 s ping.
 */
import { Marker, Polygon, Polyline } from 'react-native-maps';
import { Text, View } from 'react-native';
import type { AllyPos, LatLng, ZoneView } from '../../../shared/protocol';
import { party } from '../ui/fieldDay';
import { allyInitials, pingOpacity, zoneRing } from './mapGeometry';

const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

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
  const edge = zoneRing(c, zone.radiusM, 120);
  return (
    <>
      <Polygon coordinates={outer} holes={[edge]} fillColor="rgba(230,57,70,0.16)" strokeColor="rgba(0,0,0,0)" strokeWidth={1} />
      <Polyline
        coordinates={[...edge, edge[0]]}
        strokeColor={flash ? party.alert : 'rgba(20,24,36,0.9)'}
        strokeWidth={flash ? 4 : 3}
        lineDashPattern={[10, 8]}
      />
    </>
  );
}

export function AllyPins({ allies }: { allies: AllyPos[] }) {
  return (
    <>
      {allies.map((a) => (
        <Marker key={a.id} coordinate={toMap(a)} anchor={{ x: 0.5, y: 0.5 }} title={a.name}>
          <View style={{
            width: 30, height: 30, borderRadius: 15, backgroundColor: party.alert, borderWidth: 2, borderColor: '#fff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: party.alert, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
          }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>{allyInitials(a.name)}</Text>
          </View>
        </Marker>
      ))}
    </>
  );
}

/** Fades from fully visible to gone over `fadeMs` after the ping. */
export function PingDots({ pings, pingAt, now, fadeMs = 25_000 }: { pings: LatLng[]; pingAt: number | null; now: number; fadeMs?: number }) {
  const opacity = pingOpacity(pingAt, now, fadeMs);
  if (opacity <= 0) return null;
  return (
    <>
      {pings.map((p, i) => (
        <Marker key={`${pingAt}-${i}`} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.5 }} opacity={opacity} title="Approximate ping">
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(60,66,82,0.25)', borderWidth: 1, borderColor: 'rgba(60,66,82,0.7)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#4a5163', borderWidth: 1.5, borderColor: '#fff' }} />
          </View>
        </Marker>
      ))}
    </>
  );
}
