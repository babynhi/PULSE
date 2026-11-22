/**
 * Survivor-only danger feedback. The server sends `me.danger` (WARM/HOT) and `me.dangerLevel`
 * (0..1, how close the nearest INFECTED player is, never who). The screen edge pulses red in time
 * with a vibration heartbeat, and both scale with closeness:
 *   far (WARM edge)  ~50 bpm, one soft tap, faint glow
 *   WARM close       ~70 bpm, medium "lub-dub"
 *   HOT              ~100 bpm, heavy "lub-dub"
 *   touching         ~130 bpm, a full phone vibration every beat (the strongest iOS can do)
 * Infected players never get a level.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, Vibration, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Zone } from '../../../shared/protocol';

type Beat = { periodMs: number; peak: number; buzz: () => void };

const impact = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => { });

/** Closeness 0..1 from the server, or a sensible value from the bucket alone. */
export function closeness(danger: Zone | null | undefined, level: number | null | undefined): number {
  if (danger !== 'HOT' && danger !== 'WARM') return 0;
  if (typeof level === 'number' && level > 0) return Math.min(1, level);
  return danger === 'HOT' ? 0.75 : 0.3;
}

/** The heartbeat for a closeness, in 4 steps so the rhythm doesn't restart on every update. */
export function beatFor(t: number): Beat | null {
  if (t <= 0) return null;
  const step = t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.8 ? 2 : 3;
  const periodMs = [1200, 850, 600, 460][step];
  const gap = periodMs * 0.22;
  const buzz = [
    () => { impact(Haptics.ImpactFeedbackStyle.Medium); },
    () => { impact(Haptics.ImpactFeedbackStyle.Heavy); setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Medium), gap); },
    () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
      setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Heavy), gap);
    },
    // Closest: the real vibration motor, which is far stronger than taptic "impacts".
    () => { Vibration.vibrate(); setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Heavy), gap); },
  ][step];
  return { periodMs, peak: [0.4, 0.6, 0.85, 1][step], buzz };
}

export function DangerPulse({ danger, level }: { danger: Zone | null | undefined; level?: number | null }) {
  const t = closeness(danger, level);
  const step = t <= 0 ? -1 : t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.8 ? 2 : 3;
  const [glow] = useState(() => new Animated.Value(0));
  const active = useRef(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { active.current = state === 'active'; });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const beat = beatFor(step < 0 ? 0 : [0.1, 0.4, 0.7, 0.9][step]);
    if (!beat) {
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    const { periodMs, peak, buzz } = beat;
    // "lub-dub": a sharp rise, a smaller second bump, then fade. The far step is one soft swell.
    const loop = Animated.loop(Animated.sequence(step === 0 ? [
      Animated.timing(glow, { toValue: peak, duration: periodMs * 0.25, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.05, duration: periodMs * 0.75, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ] : [
      Animated.timing(glow, { toValue: peak, duration: periodMs * 0.12, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: peak * 0.45, duration: periodMs * 0.1, useNativeDriver: true }),
      Animated.timing(glow, { toValue: peak * 0.85, duration: periodMs * 0.1, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.08, duration: periodMs * 0.68, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    const tick = () => { if (active.current) buzz(); }; // in the background, notifications take over
    tick();
    const timer = setInterval(tick, periodMs);
    return () => { loop.stop(); clearInterval(timer); Vibration.cancel(); };
  }, [step, glow]);

  // Thicker red edge the closer they are.
  const scale = step < 0 ? 1 : [0.8, 1, 1.3, 1.6][step];
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glow }]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {/* Stacked borders fake a soft red vignette around the screen edge. */}
    <View style={[s.edge, { borderWidth: 34 * scale, borderColor: 'rgba(230,57,70,0.28)' }]} />
    <View style={[s.edge, { borderWidth: 20 * scale, borderColor: 'rgba(230,57,70,0.45)' }]} />
    <View style={[s.edge, { borderWidth: 9 * scale, borderColor: 'rgba(230,57,70,0.85)' }]} />
  </Animated.View>;
}

const s = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
