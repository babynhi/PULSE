/**
 * Full-screen map that follows the player, with a radar centered on them.
 * The radar's pulse speed and colour come from the Bluetooth proximity zone.
 * Google Maps supplies the street map. Bluetooth proximity is available before a GPS fix.
 *
 * The dot wears a direction beam, like the Google Maps puck. The map stays north-up.
 * The iOS simulator has no magnetometer, so the beam there follows the walk
 * (GPS course, or the bearing between fixes) until a phone supplies a real compass heading.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, UIManager, useWindowDimensions, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Camera } from 'react-native-maps';
import * as Location from 'expo-location';
import type { PlayerPosition } from '../net/useLocReporter';
import { ProximityRadar, RadarScope, SignalLabel, type RadarProps } from './RadarScope';
import { mapColors, radarBaseSize, roleRadarTint, streetStyles } from './radarStyle';
import { AllyPins, PingDots, ZoneOverlay } from './ZoneLayer';
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
const TICK_MS = 50;
const hasGoogleMaps = Platform.OS !== 'ios' || UIManager.hasViewManagerConfig('AIRGoogleMap');

/**
 * Interactive map (pinch zoom + drag) with the radar pinned to the player's real position.
 * Follows the player until they drag the map; a recenter button (or 10 s idle) snaps back.
 */
export function MapWithRadar(props: RadarProps) {
  if (!props.position) return <ProximityRadar band={props.band} tint={roleRadarTint(props.room.me?.role)} />;
  if (!hasGoogleMaps) return <ProximityRadar band={props.band} tint={roleRadarTint(props.room.me?.role)}
    message="Google Maps unavailable in this build · Proximity only" />;
  return <PlayerMap {...props} position={props.position} />;
}

function PlayerMap({ room, position, now, band }: RadarProps & { position: PlayerPosition }) {
  const { width } = useWindowDimensions();
  const baseSize = radarBaseSize(width);
  const tint = mapColors.player;
  const map = useRef<MapView>(null);
  const coord = { latitude: position.lat, longitude: position.lng };
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
  const pointPending = useRef(false);
  const [beamRotate] = useState(() => new Animated.Value(0));
  const [beamOpacity] = useState(() => new Animated.Value(0));
  const beamShown = useRef(0);
  const beamVisible = useRef(0);
  const tickRef = useRef<() => void>(() => { });

  function noteHeading() {
    const result = nextHeading(trackRef.current, compassRef.current, fixRef.current);
    trackRef.current = result.track;
    if (result.track.heading != null && result.source !== 'hold') headingTargetRef.current = result.track.heading;
  }

  async function updatePoint() {
    if (pointBusy.current) { pointPending.current = true; return; }
    pointBusy.current = true;
    try {
      do {
        pointPending.current = false;
        const surface = map.current;
        const coordinate = coordRef.current;
        if (!surface || !coordinate) return;
        try {
          const next = await surface.pointForCoordinate(coordinate);
          if (map.current === surface) setPoint(prev => prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next);
        } catch { /* The map may still be laying out. */ }
      } while (pointPending.current);
    } finally { pointBusy.current = false; }
  }

  useEffect(() => {
    const c = { latitude: position.lat, longitude: position.lng };
    coordRef.current = c;
    fixRef.current = { ...c, speed: position.speed ?? null, course: position.course ?? null };
    noteHeading();
    if (!followRef.current) void updatePoint();
  }, [position]);

  useEffect(() => {
    // The round already owns the GPS watcher and has a fix. Only the compass is needed here.
    let cancelled = false;
    let headSub: Location.LocationSubscription | undefined;
    Location.watchHeadingAsync(heading => {
      if (cancelled) return;
      compassRef.current = heading;
      noteHeading();
    }, () => { /* The simulator uses GPS course or its walking track. */ }).then(sub => {
      if (cancelled) sub.remove();
      else headSub = sub;
    }).catch(() => { /* GPS can still supply the beam without a compass. */ });
    const tick = setInterval(() => tickRef.current(), TICK_MS);
    return () => {
      cancelled = true;
      headSub?.remove();
      clearInterval(tick);
      clearTimeout(idle.current);
      clearTimeout(driveTimer.current);
    };
  }, []);

  // Where the player is on screen right now (the radar is drawn there).


  function seedCamera(cam?: Partial<Camera>) {
    const c = coordRef.current;
    camRef.current = {
      latitude: cam?.center?.latitude ?? c?.latitude ?? 0,
      longitude: cam?.center?.longitude ?? c?.longitude ?? 0,
      heading: cam?.heading ?? camRef.current?.heading ?? 0,
    };
    if (typeof cam?.zoom === 'number' && cam.zoom > 0) zoomRef.current = cam.zoom;
    else if (zoomRef.current == null) zoomRef.current = 17;
    readyRef.current = true;
  }

  function readCamera() {
    const current = map.current;
    if (!current) return;
    readyRef.current = false;
    current.getCamera().then(seedCamera).catch(() => seedCamera());
    void updatePoint();
  }

  function follow(on: boolean) {
    followRef.current = on;
    setFollowing(on);
    clearTimeout(idle.current);
    if (on) readCamera();
  }

  function beginGesture() {
    gesturing.current = true;
    clearTimeout(idle.current);
    if (followRef.current) follow(false);
  }

  function markDriving() {
    driving.current = true;
    clearTimeout(driveTimer.current);
    driveTimer.current = setTimeout(() => { driving.current = false; }, 250);
  }

  useEffect(() => {
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
  });

  // Radar grows when zoomed in, shrinks when zoomed out (clamped so it stays readable).
  const size = Math.max(baseSize * 0.45, Math.min(baseSize * 2.2, baseSize * (SPAN / span)));
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="light"
        mapType="standard"
        customMapStyle={streetStyles}
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
        onPanDrag={beginGesture}
        onRegionChange={(region, details) => {
          // isGesture is Google Maps only. Ignore the events our own camera steps emit.
          if (details?.isGesture) beginGesture();
          setSpan(region.latitudeDelta);
          updatePoint();
        }}
        onRegionChangeComplete={(region) => {
          if (gesturing.current && !followRef.current) {
            clearTimeout(idle.current);
            idle.current = setTimeout(() => follow(true), 10000);
          }
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
        {room.zone && <ZoneOverlay zone={room.zone} flash={room.zone.warning && Math.floor(now / 500) % 2 === 0} />}
        <AllyPins allies={room.allies} />
        <PingDots pings={room.pings} pingAt={room.pingAt} now={now} />
      </MapView>
      {(following || point) && (
        <View pointerEvents="none" style={point
          ? { position: 'absolute', left: point.x - size / 2, top: point.y - size / 2 }
          : styles.center}>
          <RadarScope zone={band} size={size} tint={tint} beam={{ rotate: beamRotate, opacity: beamOpacity }} />
        </View>
      )}
      <SignalLabel band={band} />
      {!following && (
        <Pressable onPress={() => follow(true)} style={styles.recenter} accessibilityRole="button" accessibilityLabel="Recenter on me">
          <Text style={styles.recenterLabel}>◎ Recenter</Text>
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

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  recenter: { position: 'absolute', right: 16, top: 8, minHeight: 44, justifyContent: 'center',
    backgroundColor: 'rgba(10,13,22,0.88)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(230,57,70,0.5)', paddingHorizontal: 12 },
  recenterLabel: { color: mapColors.text, fontSize: 14, fontWeight: '700' },
});
