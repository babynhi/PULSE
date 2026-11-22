/**
 * Survivor-only danger feedback. The server sends `me.danger`: how close the nearest INFECTED
 * player is (never who). The screen edge pulses red in time with a vibration heartbeat:
 * WARM = slow, soft single beat and a faint glow; HOT = fast, heavy "lub-dub" double beat and a
 * strong glow. Infected players never get a level.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Zone } from '../../../shared/protocol';

const BEAT = {
  // ~55 bpm, soft and single
  WARM: { periodMs: 1100, peak: 0.45, impact: Haptics.ImpactFeedbackStyle.Soft, second: null },
  // ~120 bpm, heavy double beat
  HOT: { periodMs: 500, peak: 1, impact: Haptics.ImpactFeedbackStyle.Heavy, second: Haptics.ImpactFeedbackStyle.Heavy },
} as const;

export function useDangerLevel(danger: Zone | null | undefined): 'WARM' | 'HOT' | null {
  return danger === 'HOT' || danger === 'WARM' ? danger : null;
}

export function DangerPulse({ danger }: { danger: Zone | null | undefined }) {
  const level = useDangerLevel(danger);
  const [glow] = useState(() => new Animated.Value(0));
  const active = useRef(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { active.current = state === 'active'; });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!level) {
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    const { periodMs, peak, impact, second } = BEAT[level];
    // WARM: one soft swell. HOT: "lub-dub", a sharp rise, a smaller second bump, then fade.
    const loop = Animated.loop(Animated.sequence(level === 'WARM' ? [
      Animated.timing(glow, { toValue: peak, duration: periodMs * 0.25, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.05, duration: periodMs * 0.75, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ] : [
      Animated.timing(glow, { toValue: peak, duration: periodMs * 0.12, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: peak * 0.45, duration: periodMs * 0.12, useNativeDriver: true }),
      Animated.timing(glow, { toValue: peak * 0.8, duration: periodMs * 0.1, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.05, duration: periodMs * 0.66, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    const beat = () => {
      if (!active.current) return; // in the background, notifications take over
      Haptics.impactAsync(impact).catch(() => { });
      if (second) setTimeout(() => Haptics.impactAsync(second).catch(() => { }), periodMs * 0.24);
    };
    beat();
    const timer = setInterval(beat, periodMs);
    return () => { loop.stop(); clearInterval(timer); };
  }, [level, glow]);

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glow }]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {/* Stacked borders fake a soft red vignette around the screen edge. */}
    <View style={[s.edge, { borderWidth: 34, borderColor: 'rgba(230,57,70,0.28)' }]} />
    <View style={[s.edge, { borderWidth: 20, borderColor: 'rgba(230,57,70,0.45)' }]} />
    <View style={[s.edge, { borderWidth: 9, borderColor: 'rgba(230,57,70,0.85)' }]} />
  </Animated.View>;
}

const s = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
