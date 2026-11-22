import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import type { LatLng, RoomView, Zone } from '../../../shared/protocol';
import { AllyPins, PingDots, ZoneOverlay } from './ZoneLayer';
import { fieldStyles, party } from '../ui/Menu';

const SPAN = 0.003; // ~150 m radius around the player

const ZONE_STYLE: Record<Zone | 'NONE', { color: string; period: number; glow: number }> = {
  HOT: { color: party.alert, period: 700, glow: 1 },
  WARM: { color: party.orange, period: 1300, glow: 0.7 },
  COLD: { color: party.ink, period: 2600, glow: 0.35 },
  NONE: { color: party.ink, period: 2600, glow: 0.35 },
};

type Coordinate = { latitude: number; longitude: number };

/**
 * Interactive map (pinch zoom + drag) with the radar pinned to the player's real position.
 * Follows the player until they move the map; a recenter button (or 10 s idle) snaps back.
 */
export function MapWithRadar({ room, position, now, band }: { room: RoomView; position: LatLng | null; now: number; band: Zone | 'NONE' }) {
  const map = useRef<MapView>(null);
  const coord = useMemo(() => position && ({ latitude: position.lat, longitude: position.lng }), [position]);
  const baseSize = 128;
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [span, setSpan] = useState(SPAN);
  const [following, setFollowing] = useState(true);
  const coordRef = useRef<Coordinate | null>(null);
  const followRef = useRef(true);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    coordRef.current = coord;
    if (!coord) return;
    if (followRef.current) map.current?.animateCamera({ center: coord }, { duration: 500 });
    else void updatePoint();
  }, [coord]);
  useEffect(() => () => clearTimeout(idle.current), []);

  // Where the player is on screen right now (the radar is drawn there).
  async function updatePoint() {
    const c = coordRef.current;
    if (!c || !map.current) return;
    try { setPoint(await map.current.pointForCoordinate(c)); } catch { }
  }

  function follow(on: boolean) {
    followRef.current = on;
    setFollowing(on);
    clearTimeout(idle.current);
    if (on) {
      const c = coordRef.current;
      if (c) map.current?.animateCamera({ center: c }, { duration: 400 });
    } else {
      idle.current = setTimeout(() => follow(true), 10000);
    }
  }

  if (!coord) return <View style={styles.note}><Text style={fieldStyles.muted}>Waiting for your location. Allow location access in PULSE settings to see the map.</Text></View>;

  // Radar grows when zoomed in, shrinks when zoomed out (clamped so it stays readable).
  const size = Math.max(baseSize * 0.45, Math.min(baseSize * 2.2, baseSize * (SPAN / span)));
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          userInterfaceStyle="light"
          mapType="mutedStandard"
          showsUserLocation={!point}
          showsPointsOfInterests={false}
          showsBuildings={false}
          showsCompass={false}
          showsScale={false}
          showsTraffic={false}
          showsIndoors={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled
          zoomEnabled
          minZoomLevel={13}
          maxZoomLevel={20}
          initialRegion={{ ...coord, latitudeDelta: SPAN, longitudeDelta: SPAN }}
          onPanDrag={() => followRef.current && follow(false)}
          onRegionChange={(r, details) => {
            if (details?.isGesture && followRef.current) follow(false);
            setSpan(r.latitudeDelta);
            updatePoint();
          }}
          onRegionChangeComplete={(r) => { setSpan(r.latitudeDelta); updatePoint(); }}
          onMapReady={updatePoint}
        >
          {room.zone && <ZoneOverlay zone={room.zone} flash={room.zone.warning && Math.floor(now / 500) % 2 === 0} />}
          <AllyPins allies={room.allies ?? []} />
          <PingDots pings={room.pings ?? []} pingAt={room.pingAt ?? null} now={now} />
      </MapView>
      {point && (
        <View pointerEvents="none" style={{ position: 'absolute', left: point.x - size / 2, top: point.y - size / 2 }}>
          <Radar zone={band} size={size} />
        </View>
      )}
      {!following && (
        <Pressable onPress={() => follow(true)} style={styles.recenter} accessibilityRole="button" accessibilityLabel="Recenter on me">
          <Text style={fieldStyles.label}>◎ Recenter</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Concentric glowing rings + a rotating sweep around the player. */
function Radar({ zone, size }: { zone: Zone | 'NONE'; size: number }) {
  const z = ZONE_STYLE[zone];
  const [pulse] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    pulse.setValue(0);
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: z.period, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [z.period, pulse]);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const waveScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const waveOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.8 * z.glow + 0.2, 0.25 * z.glow, 0] });
  const ring = (f: number) => ({
    position: 'absolute' as const,
    width: size * f, height: size * f, borderRadius: (size * f) / 2,
    borderWidth: 1.5, borderColor: z.color, opacity: 0.25 + 0.45 * z.glow * f,
    shadowColor: z.color, shadowOpacity: z.glow, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  });

  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={ring(1)} />
      <View style={ring(0.66)} />
      <View style={ring(0.33)} />
      {/* expanding pulse wave */}
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: 3, borderColor: z.color, opacity: waveOpacity, transform: [{ scale: waveScale }],
      }} />
      {/* sweep: a glowing arm with a faint trailing quarter */}
      <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
        <View style={{
          position: 'absolute', left: size / 2 - 1, top: 0, width: 2, height: size / 2,
          backgroundColor: z.color, opacity: 0.9,
          shadowColor: z.color, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
        }} />
        <View style={{
          position: 'absolute', left: size / 2 - size / 4, top: 0, width: size / 4, height: size / 2,
          borderTopLeftRadius: size / 2, backgroundColor: z.color, opacity: 0.08,
        }} />
      </Animated.View>
      {/* the player */}
      <View style={{
        width: 14, height: 14, borderRadius: 7, backgroundColor: party.paper, borderWidth: 3, borderColor: party.ink,
        shadowColor: party.ink, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flex: 1, padding: 16, justifyContent: 'center' },
  recenter: { position: 'absolute', right: 8, top: 8, minHeight: 44, justifyContent: 'center',
    backgroundColor: party.paper, borderRadius: 8, borderWidth: 1, borderColor: party.ink, paddingHorizontal: 12 },
});
