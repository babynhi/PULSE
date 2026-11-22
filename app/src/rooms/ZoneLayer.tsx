/**
 * Things drawn on the round map: the safe zone (dark dotted edge + red tint outside),
 * live pins for fellow infected, and the fading grey dots of the last ping.
 * Pins and dots glide smoothly to each new position and wear a small pulsing ring.
 */
import { useEffect, useRef, useState } from 'react';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';
import { Text, View } from 'react-native';
import type { AllyPos, LatLng, ZoneView } from '../../../shared/protocol';
import { mapColors } from './radarStyle';
import { allyInitials, glideAt, matchPings, pingOpacity, zoneRing, type Keyed } from './mapGeometry';

const PULSE_MS = 1600;
const FRAME_MS = 50;
type Track = { from: LatLng; to: LatLng; at: number };

/** Positions that glide (eased, over `ms`) whenever a key's target moves, re-rendered ~20 fps. */
function useGlide(targets: Keyed[], ms: number) {
  const tracks = useRef(new Map<string, Track>());
  const [now, setNow] = useState(Date.now);
  const t = Date.now();
  const next = new Map<string, Track>();
  for (const x of targets) {
    const old = tracks.current.get(x.key);
    if (!old) next.set(x.key, { from: x, to: x, at: t });
    else if (old.to.lat === x.lat && old.to.lng === x.lng) next.set(x.key, old);
    else next.set(x.key, { from: glideAt(old, t, ms), to: { lat: x.lat, lng: x.lng }, at: t });
  }
  tracks.current = next;
  const live = targets.length > 0;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), FRAME_MS);
    return () => clearInterval(id);
  }, [live]);
  const at = Math.max(now, t);
  return { at, points: targets.map(x => ({ ...x, ...glideAt(next.get(x.key)!, at, ms) })) };
}

/** A small ring that grows and fades around a moving player. */
function PulseRing({ at, center, rgb, opacity = 1 }: { at: number; center: LatLng; rgb: string; opacity?: number }) {
  const phase = (at % PULSE_MS) / PULSE_MS;
  const a = (1 - phase) * opacity;
  return <Circle center={toMap(center)} radius={3 + 11 * phase} strokeWidth={2}
    strokeColor={`rgba(${rgb},${(0.8 * a).toFixed(3)})`} fillColor={`rgba(${rgb},${(0.18 * a).toFixed(3)})`} zIndex={1} />;
}

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
      <Polygon coordinates={outer} holes={[edge]} fillColor={mapColors.zoneOutside} strokeColor="transparent" strokeWidth={1} />
      <Polyline
        coordinates={[...edge, edge[0]]}
        strokeColor={flash ? mapColors.infected : mapColors.zoneEdge}
        strokeWidth={flash ? 4 : 3}
        lineDashPattern={[10, 8]}
      />
    </>
  );
}

export function AllyPins({ allies }: { allies: AllyPos[] }) {
  // Ally positions arrive about once a second: glide over that second so pins walk instead of jump.
  const { at, points } = useGlide(allies.map(a => ({ key: a.id, lat: a.lat, lng: a.lng })), 1000);
  return (
    <>
      {points.map((p, i) => <PulseRing key={'ring-' + p.key} at={at} center={p} rgb="230,57,70" />)}
      {points.map((p, i) => (
        <Marker key={p.key} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.5 }} title={allies[i].name} zIndex={2}>
          <View style={{
            width: 30, height: 30, borderRadius: 15, backgroundColor: mapColors.infected, borderWidth: 2, borderColor: mapColors.white,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: mapColors.infected, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
          }}>
            <Text style={{ color: mapColors.white, fontSize: 12, fontWeight: '900' }}>{allyInitials(allies[i].name)}</Text>
          </View>
        </Marker>
      ))}
    </>
  );
}

/** Fades from fully visible to gone over `fadeMs` after the ping; each dot glides from its previous ping spot. */
export function PingDots({ pings, pingAt, now, fadeMs = 25_000 }: { pings: LatLng[]; pingAt: number | null; now: number; fadeMs?: number }) {
  const prev = useRef<{ pingAt: number | null; dots: Keyed[] }>({ pingAt: null, dots: [] });
  const seq = useRef(0);
  if (prev.current.pingAt !== pingAt) {
    prev.current = { pingAt, dots: matchPings(prev.current.dots, pings, () => 'ping-' + seq.current++) };
  }
  const opacity = pingOpacity(pingAt, now, fadeMs);
  const { at, points } = useGlide(opacity > 0 ? prev.current.dots : [], 1500);
  if (opacity <= 0) return null;
  return (
    <>
      {points.map(p => <PulseRing key={'ring-' + p.key} at={at} center={p} rgb="74,81,99" opacity={opacity} />)}
      {points.map(p => (
        <Marker key={p.key} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.5 }} opacity={opacity} title="Approximate ping" zIndex={2}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: mapColors.pingHalo, borderWidth: 1, borderColor: mapColors.pingEdge, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: mapColors.pingCore, borderWidth: 1.5, borderColor: mapColors.white }} />
          </View>
        </Marker>
      ))}
    </>
  );
}
