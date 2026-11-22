import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import type { RoomView, Zone } from '../../../shared/protocol';
import { party } from '../ui/fieldDay';
import type { PlayerPosition } from '../net/useLocReporter';

export type RadarProps = { room: RoomView; position: PlayerPosition | null; now: number; band: Zone | 'NONE' };

const ZONE_STYLE: Record<Zone | 'NONE', { color: string; period: number; glow: number }> = {
  HOT: { color: party.alert, period: 700, glow: 1 },
  WARM: { color: party.orange, period: 1300, glow: 0.7 },
  COLD: { color: party.ink, period: 2600, glow: 0.35 },
  NONE: { color: party.ink, period: 2600, glow: 0.35 },
};

type BeamAnim = { rotate: Animated.Value; opacity: Animated.Value };
const BEAM = 88;

/** Concentric glowing rings + a rotating sweep around the player. */
export function RadarScope({ zone, size, tint, beam }: { zone: Zone | 'NONE'; size: number; tint?: string; beam?: BeamAnim }) {
  const base = ZONE_STYLE[zone];
  const z = tint && (zone === 'COLD' || zone === 'NONE') ? { ...base, color: tint } : base;
  const me = tint ?? party.ink;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription?.remove(); };
  }, []);
  const [pulse] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    pulse.setValue(0);
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: z.period, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [z.period, pulse, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [sweep, reduceMotion]);

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
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: me + '61',
          }} />
          <View style={{
            position: 'absolute', top: size / 2 - BEAM * 0.7, left: (size - 32) / 2, width: 0, height: 0,
            borderLeftWidth: 16, borderRightWidth: 16, borderTopWidth: BEAM * 0.7,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: me + 'C7',
          }} />
        </Animated.View>
      )}
      {/* the player */}
      <View style={{
        width: 14, height: 14, borderRadius: 7, backgroundColor: party.paper, borderWidth: 3, borderColor: me,
        shadowColor: me, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }} />
      <Text style={[styles.self, { top: size / 2 + 10 }]}>You</Text>
    </View>
  );
}

const signalLabels = { HOT: 'Very close signal', WARM: 'Nearby signal', COLD: 'Distant signal', NONE: 'No nearby signal' };

export function SignalLabel({ band }: { band: RadarProps['band'] }) {
  return <View pointerEvents="none" style={styles.readout}>
    <View style={[styles.light, { backgroundColor: band === 'NONE' ? party.panel : ZONE_STYLE[band].color }]} />
    <Text style={styles.caption}>{signalLabels[band]}</Text>
  </View>;
}

/** Bluetooth estimates closeness without a GPS fix or a bearing to another player. */
export function ProximityRadar({ band }: { band: RadarProps['band'] }) {
  return <View style={styles.proximity}>
    <RadarScope zone={band} size={132} />
    <SignalLabel band={band} />
    <Text style={styles.location}>Location unavailable · Proximity only</Text>
  </View>;
}

const styles = StyleSheet.create({
  proximity: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: party.sky },
  readout: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: party.ink, borderRadius: 5, backgroundColor: party.panel },
  light: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: party.ink },
  caption: { color: party.ink, fontSize: 13, fontWeight: '800' },
  self: { position: 'absolute', paddingHorizontal: 4, borderRadius: 3, backgroundColor: party.panel, color: party.ink,
    fontSize: 11, fontWeight: '800' },
  location: { position: 'absolute', bottom: 6, alignSelf: 'center', color: party.ink, fontSize: 13, fontWeight: '600' },
});
