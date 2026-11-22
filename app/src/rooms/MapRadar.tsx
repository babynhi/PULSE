/**
 * Full-screen dark map that follows the player, with a radar centered on them.
 * The radar's pulse speed and colour come from the Bluetooth proximity zone.
 * Apple Maps (no API key needed). If location is denied, the radar sits on plain dark.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import type { Zone } from '../../../shared/protocol';
import { C } from './ui';

const SPAN = 0.003; // ~150 m radius around the player

const ZONE_STYLE: Record<Zone | 'NONE', { text: string; color: string; period: number; glow: number }> = {
  HOT: { text: 'YOU ARE NOT ALONE!', color: C.red, period: 700, glow: 1 },
  WARM: { text: 'Movements detected', color: C.amber, period: 1300, glow: 0.7 },
  COLD: { text: "It's quiet...", color: C.red, period: 2600, glow: 0.35 },
  NONE: { text: "It's quiet...", color: C.red, period: 2600, glow: 0.35 },
};

type LatLng = { latitude: number; longitude: number };

/**
 * Interactive map (pinch zoom + drag) with the radar pinned to the player's real position.
 * Follows the player until they move the map; a recenter button (or 10 s idle) snaps back.
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
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm.status !== 'granted') return setStatus('denied');
        setStatus('ok');
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 1000 },
          (pos) => {
            const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            coordRef.current = c;
            setCoord(c);
            if (followRef.current) map.current?.animateCamera({ center: c }, { duration: 500 });
            else updatePoint();
          },
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => { cancelled = true; sub?.remove(); clearTimeout(idle.current); };
  }, []);

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
          userInterfaceStyle="dark"
          mapType="mutedStandard"
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
          onRegionChange={(r, details) => {
            if (details?.isGesture && followRef.current) follow(false);
            setSpan(r.latitudeDelta);
            updatePoint();
          }}
          onRegionChangeComplete={(r) => { setSpan(r.latitudeDelta); updatePoint(); }}
          onMapReady={updatePoint}
        >
          {mapChildren}
        </MapView>
      )}
      {/* darken the map so the radar glow reads */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,7,14,0.45)' }]} />
      {point && (
        <View pointerEvents="none" style={{ position: 'absolute', left: point.x - size / 2, top: point.y - size / 2 }}>
          <Radar zone={zone} size={size} tint={tint} />
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

/** Concentric glowing rings + a rotating sweep around the player. */
export function Radar({ zone, size, tint }: { zone: Zone | 'NONE'; size: number; tint?: string }) {
  // Quiet radar wears the role colour; WARM/HOT keep their amber/red alert so danger reads the same for everyone.
  const base = ZONE_STYLE[zone];
  const z = tint && (zone === 'COLD' || zone === 'NONE') ? { ...base, color: tint } : base;
  const me = tint ?? z.color;
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

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
