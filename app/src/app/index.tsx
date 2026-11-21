/**
 * PULSE home screen: blurry black-and-white background that flushes red on every
 * heartbeat, a script "Pulse" title that beats with it, and three menu choices.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, Stack } from 'expo-router';
import { useFonts, GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { IMFellEnglishSC_400Regular } from '@expo-google-fonts/im-fell-english-sc';

const { width: W, height: H } = Dimensions.get('window');

const MENU = [
  { label: 'Join a Game', href: '/join' },
  { label: 'Host a Game', href: '/host' },

] as const;

export default function Home() {
  const [fontsLoaded] = useFonts({ GreatVibes_400Regular, IMFellEnglishSC_400Regular });
  const beat = useHeartbeat();
  const redOpacity = beat.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] });

  return (
    <View style={s.screen}>
      <Image source={require('../../assets/pulse/bg.jpg')} style={[StyleSheet.absoluteFill, { width: W, height: H }]} resizeMode="cover" />
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* The red flush on each beat */}
      <Animated.Image
        source={require('../../assets/pulse/red-vignette.png')}
        style={[StyleSheet.absoluteFill, { width: W, height: H, opacity: redOpacity }]}
        resizeMode="stretch"
      />
      <Motes />

      <View style={s.center}>
        <Title beat={beat} fonts={fontsLoaded} />
        <View style={s.menu}>
          <Image source={require('../../assets/pulse/divider.png')} style={s.divider} />
          {MENU.map((m) => (
            <MenuItem key={m.label} label={m.label} fonts={fontsLoaded} onPress={() => router.push(m.href as any)} />
          ))}
          <Image source={require('../../assets/pulse/divider.png')} style={[s.divider, { transform: [{ scaleY: -1 }] }]} />
        </View>
      </View>
    </View>
  );
}

/** Thump-thump... pause (about every 3 s). 0 = resting, 1 = peak of the beat. */
function useHeartbeat() {
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const go = (to: number, ms: number) =>
      Animated.timing(beat, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([go(1, 160), go(0.15, 260), go(0.7, 150), go(0, 900), Animated.delay(1500)]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);
  return beat;
}

function Title({ beat, fonts }: { beat: Animated.Value; fonts: boolean }) {
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const redGlow = beat.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const font = fonts ? { fontFamily: 'GreatVibes_400Regular' } : { fontFamily: 'Snell Roundhand' };
  return (
    <Animated.View style={[s.titleWrap, { transform: [{ scale }] }]}>
      {/* white glow version underneath, red glow version fades in on the beat */}
      <Text style={[s.title, font]}>Pulse</Text>
      <Animated.Text style={[s.title, s.titleRed, font, { opacity: redGlow }]}>Pulse</Animated.Text>
    </Animated.View>
  );
}

/** Menu entry; curly flourishes appear on both sides while pressed. */
function MenuItem({ label, fonts, onPress }: { label: string; fonts: boolean; onPress: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <Pressable onPressIn={() => setOn(true)} onPressOut={() => setOn(false)} onPress={onPress} style={s.item}>
      <Image source={require('../../assets/pulse/curl.png')} style={[s.curl, !on && s.hidden]} />
      <Text style={[s.itemText, fonts && { fontFamily: 'IMFellEnglishSC_400Regular' }, on && s.itemOn]}>{label}</Text>
      <Image source={require('../../assets/pulse/curl.png')} style={[s.curl, { transform: [{ scaleX: -1 }] }, !on && s.hidden]} />
    </Pressable>
  );
}

/** Faint pale specks drifting up through the blur. */
function Motes() {
  const specks = useMemo(
    () =>
      Array.from({ length: 18 }, () => ({
        x: Math.random() * W,
        size: 1.5 + Math.random() * 2,
        duration: 10000 + Math.random() * 9000,
        delay: Math.random() * 8000,
      })),
    [],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {specks.map((p, i) => (
        <Mote key={i} {...p} />
      ))}
    </View>
  );
}

function Mote({ x, size, duration, delay }: { x: number; size: number; duration: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, duration, delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [H * 1.05, -20] });
  const translateX = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10, -6] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.6, 0.6, 0] });
  return (
    <Animated.View
      style={[s.mote, { left: x, width: size, height: size, borderRadius: size, opacity, transform: [{ translateY }, { translateX }] }]}
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 20 },

  titleWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 48 },
  title: {
    fontSize: 112,
    color: '#f1f1f1',
    textShadowColor: 'rgba(255,255,255,0.75)',
    textShadowRadius: 16,
    paddingHorizontal: 20, // script swashes stick out, keep them from being clipped
  },
  titleRed: { position: 'absolute', textShadowColor: 'rgba(255,40,40,1)', textShadowRadius: 26 },

  menu: { alignItems: 'center', gap: 4 },
  divider: { width: 160, height: 28, marginVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemText: {
    fontFamily: 'Baskerville',
    fontSize: 32,
    letterSpacing: 1,
    color: '#ececec',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
  },
  itemOn: { color: '#ffffff', textShadowColor: 'rgba(255,255,255,0.85)', textShadowRadius: 10 },
  curl: { width: 54, height: 17 },
  hidden: { opacity: 0 },

  mote: { position: 'absolute', backgroundColor: '#e6e6e6' },
});
