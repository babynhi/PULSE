/**
 * Full-screen map that follows the player, with a radar centered on them.
 * The radar's pulse speed and colour come from the Bluetooth proximity zone.
 * Apple Maps, light, the way a normal road map looks. If location is denied, the radar sits on plain dark.
 *
 * The dot wears a direction beam, like the Google Maps puck. The map stays north-up.
 * The iOS simulator has no magnetometer, so the beam there follows the walk
 * (GPS course, or the bearing between fixes) until a phone supplies a real compass heading.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type Camera } from 'react-native-maps';
import * as Location from 'expo-location';
import type { Zone } from '../../../shared/protocol';
import { C } from './ui';
import {
  angleDelta,
  beamScreenAngle,
  distanceM,
  nextHeading,
  smoothHeading,
  stepCamera,
  type CompassSample,
  type GeoFix,
  type HeadingTrack,
  type LatLng,
} from './heading';

const SPAN = 0.003; // ~150 m radius around the player
const BEAM = 88;
const TICK_MS = 50;

const ZONE_STYLE: Record<Zone | 'NONE', { text: string; color: string; period: number; glow: number }> = {
  HOT: { text: 'YOU ARE NOT ALONE!', color: C.red, period: 700, glow: 1 },
  WARM: { text: 'Movements detected', color: C.amber, period: 1300, glow: 0.7 },
  COLD: { text: "It's quiet...", color: C.red, period: 2600, glow: 0.35 },
  NONE: { text: "It's quiet...", color: C.red, period: 2600, glow: 0.35 },
};

type BeamAnim = { rotate: Animated.Value; opacity: Animated.Value };

/**
 * Interactive map (pinch zoom + drag) with the radar pinned to the player's real position.
 * Follows the player until they drag the map; a recenter button (or 10 s idle) snaps back.
 */
export function MapWithRadar({ zone, baseSize, children, mapChildren, tint }: {
  zone: Zone | 'NONE'; baseSize: number; children?: React.ReactNode; /** role colour for the resting radar and the player dot */ tint?: string; /** overlays drawn on the map itself (zone, pins) */ mapChildren?: React.ReactNode;
}) {
  const map = useRef<MapView>(null);
  const [status, setStatus] = useState<'asking' | 'ok' | 'denied'>('asking');
  const [coord, setCoord] = useState<LatLng | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [span, setSpan] = useState(SPAN);
  const [following, setFollowing] = useState(true);
  const coordRef = useRef<LatLng | null>(null);
  const followRef = useRef(true);
  const readyRef = useRef(false);
  const camRef = useRef<LatLng & { heading: number } | null>(null);
  const zoomRef = useRef<number | undefined>(undefined);
  const compassRef = useRef<CompassSample | null>(null);
  const fixRef = useRef<GeoFix | null>(null);
  const trackRef = useRef<HeadingTrack>({ anchor: null, heading: null });
  const headingTargetRef = useRef<number | null>(null);
  const gesturing = useRef(false);
  const headingRef = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const driveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const driving = useRef(false);
  const pointBusy = useRef(false);
  const beamRotate = useRef(new Animated.Value(0)).current;
  const beamOpacity = useRef(new Animated.Value(0)).current;
  const beamShown = useRef(0);
  const beamVisible = useRef(0);
  const tickRef = useRef<() => void>(() => { });
  const noteRef = useRef<() => void>(() => { });
  const pointRef = useRef<() => void>(() => { });

  useEffect(() => {
    let posSub: Location.LocationSubscription | undefined;
    let headSub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm.status !== 'granted') return setStatus('denied');
        setStatus('ok');
        posSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 1000 },
          (pos) => {
            const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            if (coordRef.current == null) setCoord(c);
            coordRef.current = c;
            fixRef.current = { ...c, speed: pos.coords.speed, course: pos.coords.heading };
            noteRef.current();
            if (!followRef.current) pointRef.current();
          },
        );
        if (cancelled) { posSub.remove(); return; }
      } catch {
        if (!cancelled) setStatus('denied');
      }
      if (cancelled || !posSub) return;
      // A missing compass (the simulator) must not hide the map.
      try {
        headSub = await Location.watchHeadingAsync(
          (heading) => {
            compassRef.current = heading;
            noteRef.current();
          },
          () => { /* simulator: no compass. The walk's course stands in. */ },
        );
        if (cancelled) headSub.remove();
      } catch { /* same fallback */ }
    })();
    return () => {
      cancelled = true;
      posSub?.remove();
      headSub?.remove();
      clearTimeout(idle.current);
      clearTimeout(driveTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickRef.current(), TICK_MS);
    return () => clearInterval(id);
  }, []);

  noteRef.current = () => {
    const result = nextHeading(trackRef.current, compassRef.current, fixRef.current);
    trackRef.current = result.track;
    if (result.track.heading != null && result.source !== 'hold') headingTargetRef.current = result.track.heading;
  };

  // Where the player is on screen right now (the radar is drawn there).
  async function updatePoint() {
    const c = coordRef.current;
    if (!c || !map.current || pointBusy.current) return;
    pointBusy.current = true;
    try {
      const next = await map.current.pointForCoordinate(c);
      setPoint((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
    } catch { /* map not laid out yet */ }
    finally { pointBusy.current = false; }
  }
  pointRef.current = () => { void updatePoint(); };

  function seedCamera(cam?: Partial<Camera>) {
    const c = coordRef.current;
    camRef.current = {
      latitude: cam?.center?.latitude ?? c?.latitude ?? 0,
      longitude: cam?.center?.longitude ?? c?.longitude ?? 0,
      heading: cam?.heading ?? camRef.current?.heading ?? 0,
    };
    if (typeof cam?.zoom === 'number' && cam.zoom > 0) zoomRef.current = cam.zoom;
    else if (Platform.OS === 'android' && zoomRef.current == null) zoomRef.current = 17;
    readyRef.current = true;
  }

  function readCamera() {
    const current = map.current;
    if (!current) return;
    readyRef.current = false;
    current.getCamera().then(seedCamera).catch(() => seedCamera());
  }

  function follow(on: boolean) {
    followRef.current = on;
    setFollowing(on);
    clearTimeout(idle.current);
    if (on) readCamera();
    else idle.current = setTimeout(() => follow(true), 10000);
  }

  function markDriving() {
    driving.current = true;
    clearTimeout(driveTimer.current);
    driveTimer.current = setTimeout(() => { driving.current = false; }, 250);
  }

  tickRef.current = () => {
    headingRef.current = smoothHeading(headingRef.current, headingTargetRef.current, 0.28);
    const shown = headingRef.current;
    const camHeading = camRef.current?.heading ?? 0;
    const visible = shown == null ? 0 : 1;
    if (beamVisible.current !== visible) {
      beamVisible.current = visible;
      beamOpacity.setValue(visible);
    }
    if (shown != null) approach(beamShown, beamRotate, beamScreenAngle(shown, camHeading));
    const target = coordRef.current;
    const cam = camRef.current;
    if (!followRef.current || !readyRef.current || gesturing.current || !map.current || !target || !cam) return;
    if (Platform.OS === 'android' && zoomRef.current == null) return;

    const next = stepCamera(cam, target, shown, false);
    if (distanceM(cam, next) < 0.08 && Math.abs(angleDelta(cam.heading, next.heading)) < 0.25) return;
    camRef.current = next;
    const camera: Partial<Camera> = {
      center: { latitude: next.latitude, longitude: next.longitude },
      heading: next.heading,
      pitch: 0,
    };
    if (zoomRef.current != null) camera.zoom = zoomRef.current;
    markDriving();
    map.current.setCamera(camera);
    if (shown != null) approach(beamShown, beamRotate, beamScreenAngle(shown, next.heading));
    updatePoint();
  };

  if (status !== 'ok') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
        {status === 'denied' && (
          <Text style={styles.note}>Location is off, so the map is hidden. Turn it on in Settings → PULSE → Location.</Text>
        )}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Radar zone={zone} size={baseSize} tint={tint} />
        </View>
        {children}
      </View>
    );
  }

  // Radar grows when zoomed in, shrinks when zoomed out (clamped so it stays readable).
  const size = Math.max(baseSize * 0.45, Math.min(baseSize * 2.2, baseSize * (SPAN / span)));
  return (
    <View style={StyleSheet.absoluteFill}>
      {coord && (
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          userInterfaceStyle="light"
          mapType="standard"
          showsUserLocation={false}
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
          onRegionChange={(region, details) => {
            // isGesture is Google Maps only. Ignore the events our own camera steps emit.
            if (details?.isGesture) gesturing.current = true;
            if (details?.isGesture && followRef.current && !driving.current) follow(false);
            setSpan(region.latitudeDelta);
            updatePoint();
          }}
          onRegionChangeComplete={(region) => {
            gesturing.current = false;
            setSpan(region.latitudeDelta);
            if (!driving.current) {
              map.current?.getCamera().then((cam) => {
                if (typeof cam.zoom === 'number' && cam.zoom > 0) zoomRef.current = cam.zoom;
              }).catch(() => { });
            }
            updatePoint();
          }}
          onMapReady={readCamera}
        >
          {mapChildren}
        </MapView>
      )}
      {point && (
        <View pointerEvents="none" style={{ position: 'absolute', left: point.x - size / 2, top: point.y - size / 2 }}>
          <Radar zone={zone} size={size} tint={tint} beam={{ rotate: beamRotate, opacity: beamOpacity }} />
        </View>
      )}
      {children}
      {!following && (
        <Pressable onPress={() => follow(true)} style={styles.recenter} accessibilityRole="button" accessibilityLabel="Recenter on me">
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>◎ Recenter</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Shortest-path rotate so the beam never spins the long way around. */
function approach(shown: { current: number }, anim: Animated.Value, target: number) {
  const currentMod = ((shown.current % 360) + 360) % 360;
  const delta = ((target - currentMod + 540) % 360) - 180;
  // The tick runs 20 times a second; skip writes the eye can't see.
  if (Math.abs(delta) < 0.1) return;
  shown.current += delta;
  anim.setValue(shown.current);
}

function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Concentric glowing rings + a rotating sweep around the player. */
export function Radar({ zone, size, tint, beam }: { zone: Zone | 'NONE'; size: number; tint?: string; beam?: BeamAnim }) {
  // Quiet radar wears the role colour; WARM/HOT keep their amber/red alert so danger reads the same for everyone.
  const base = ZONE_STYLE[zone];
  const z = tint && (zone === 'COLD' || zone === 'NONE') ? { ...base, color: tint } : base;
  const me = tint ?? z.color;
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
  const beamRotate = beam?.rotate.interpolate({
    inputRange: [-100000, 100000],
    outputRange: ['-100000deg', '100000deg'],
  });
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
      {beam && beamRotate && (
        <Animated.View style={{
          position: 'absolute', width: size, height: size, alignItems: 'center',
          opacity: beam.opacity, transform: [{ rotate: beamRotate }],
        }}>
          <View style={{
            position: 'absolute', top: size / 2 - BEAM, left: (size - 72) / 2, width: 0, height: 0,
            borderLeftWidth: 36, borderRightWidth: 36, borderTopWidth: BEAM,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: withAlpha(me, 0.38),
          }} />
          <View style={{
            position: 'absolute', top: size / 2 - BEAM * 0.7, left: (size - 32) / 2, width: 0, height: 0,
            borderLeftWidth: 16, borderRightWidth: 16, borderTopWidth: BEAM * 0.7,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: withAlpha(me, 0.78),
          }} />
        </Animated.View>
      )}
      {/* the player */}
      <View style={{
        width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', borderWidth: 3, borderColor: me,
        shadowColor: me, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }} />
    </View>
  );
}

export function radarText(zone: Zone | 'NONE') {
  return ZONE_STYLE[zone];
}

const styles = StyleSheet.create({
  note: { position: 'absolute', top: 150, left: 24, right: 24, color: C.muted, fontSize: 13, textAlign: 'center' },
  recenter: { position: 'absolute', right: 16, top: 160, backgroundColor: 'rgba(10,13,22,0.88)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(230,57,70,0.5)', paddingVertical: 8, paddingHorizontal: 12 },
});