/**
 * Things drawn on the round map: the safe zone (dark dotted edge + red tint outside),
 * live pins for fellow infected, the infected-only survivor pings (fuzzed, delayed, labelled
 * "30s ago"), and anonymous infection markers that fade out over a minute.
 * Pins and dots glide smoothly to each new position and wear a small pulsing ring.
 */
import { useEffect, useState } from 'react';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';
import { Text, View } from 'react-native';
import { INFECTION_MARK_MS, type AllyPos, type InfectionMark, type LatLng, type PingDot, type ZoneView } from '../../../shared/protocol';
import { mapColors } from './radarStyle';
import { agoLabel, glideAt, markOpacity, pingOpacity, zoneRing, type Keyed } from './mapGeometry';
import { PlayerIcon } from '../ui/PlayerIcon';

const PULSE_MS = 1600;
const FRAME_MS = 50;
type Track = { from: LatLng; to: LatLng; at: number };

/** Positions that glide (eased, over `ms`) whenever a key's target moves, re-rendered ~20 fps. */
function useGlide(targets: Keyed[], ms: number) {
  const [now, setNow] = useState(Date.now);
  const sig = targets.map(x => `${x.key}:${x.lat},${x.lng}`).join('|');
  const [glide, setGlide] = useState<{ sig: string; tracks: Map<string, Track> }>({ sig: '', tracks: new Map() });
  let tracks = glide.tracks;
  if (glide.sig !== sig) {
    // Targets moved: start a new glide from wherever each dot is drawn right now (derived state).
    tracks = new Map();
    for (const x of targets) {
      const old = glide.tracks.get(x.key);
      if (!old) tracks.set(x.key, { from: x, to: x, at: now });
      else if (old.to.lat === x.lat && old.to.lng === x.lng) tracks.set(x.key, old);
      else tracks.set(x.key, { from: glideAt(old, now, ms), to: { lat: x.lat, lng: x.lng }, at: now });
    }
    setGlide({ sig, tracks });
  }
  const live = targets.length > 0;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), FRAME_MS);
    return () => clearInterval(id);
  }, [live]);
  return { at: now, points: targets.map(x => ({ ...x, ...glideAt(tracks.get(x.key)!, now, ms) })) };
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
  const byId = new Map(allies.map(a => [a.id, a]));
  return (
    <>
      {points.map((p, i) => <PulseRing key={'ring-' + p.key} at={at} center={p} rgb="230,57,70" />)}
      {points.map(p => (
        <Marker key={p.key} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.5 }} title={byId.get(p.key)?.name} zIndex={2}>
          <View style={{ shadowColor: mapColors.infected, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }}>
            <PlayerIcon icon={byId.get(p.key)?.icon} size={30} ring={mapColors.infected} ringWidth={3} />
          </View>
        </Marker>
      ))}
    </>
  );
}

/**
 * Infected only: where survivors WERE. Every dot is fuzzed and delayed by the server; the label
 * counts up ("30s ago") so nobody mistakes it for a live position. Fades as it gets old.
 */
export function PingDots({ pings, pingAt, now, fadeMs = 40_000 }: { pings: PingDot[]; pingAt: number | null; now: number; fadeMs?: number }) {
  // Pair each new ping with the dot it most likely belongs to, so dots glide instead of jumping.
  // Pings carry each survivor's icon, so a dot glides from its last spot to its new one by icon.
  const dots: (Keyed & { icon: string })[] = pings.map(p => ({ key: 'ping-' + p.icon, icon: p.icon, lat: p.lat, lng: p.lng }));
  const icons = new Map(dots.map(d => [d.key, d.icon]));
  const opacity = pingOpacity(pingAt, now, fadeMs);
  const { at, points } = useGlide(opacity > 0 ? dots : [], 1500);
  if (opacity <= 0 || !pings.length) return null;
  const label = agoLabel(pings[0].at, now);
  return (
    <>
      {points.map(p => <PulseRing key={'ring-' + p.key} at={at} center={p} rgb="74,81,99" opacity={opacity} />)}
      {points.map(p => (
        <Marker key={p.key} coordinate={toMap(p)} anchor={{ x: 0.5, y: 0.3 }} opacity={Math.max(0.45, opacity)} title={'Survivor · ' + label} zIndex={2}>
          <View style={{ alignItems: 'center' }}>
            <PlayerIcon icon={icons.get(p.key)} size={28} ring={mapColors.amber} ringWidth={3} />
            <View style={{ marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(10,13,22,0.85)' }}>
              <Text style={{ color: mapColors.white, fontSize: 11, fontWeight: '800' }}>{label}</Text>
            </View>
          </View>
        </Marker>
      ))}
    </>
  );
}

/** Anonymous "someone was infected around here" markers, fading out over INFECTION_MARK_MS. */
export function InfectionMarks({ marks, now }: { marks: InfectionMark[] | undefined; now: number }) {
  const live = (marks ?? []).filter(m => markOpacity(m.at, now, INFECTION_MARK_MS) > 0);
  return (
    <>
      {live.map(m => {
        const o = markOpacity(m.at, now, INFECTION_MARK_MS);
        return <Circle key={'mark-ring-' + m.id} center={toMap(m)} radius={14} strokeWidth={2}
          strokeColor={`rgba(230,57,70,${(0.9 * o).toFixed(3)})`} fillColor={`rgba(230,57,70,${(0.22 * o).toFixed(3)})`} zIndex={1} />;
      })}
      {live.map(m => (
        <Marker key={'mark-' + m.id} coordinate={toMap(m)} anchor={{ x: 0.5, y: 0.5 }} opacity={markOpacity(m.at, now, INFECTION_MARK_MS)}
          title={'Someone was infected here · ' + agoLabel(m.at, now)} zIndex={3}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(29,15,18,0.92)', borderWidth: 2, borderColor: mapColors.infected,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15 }}>🧟</Text>
          </View>
        </Marker>
      ))}
    </>
  );
}
