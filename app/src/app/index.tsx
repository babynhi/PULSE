import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { menuActionLayout, MenuItem, MenuPaper, party } from '../ui/Menu';

const trackHeight = 246;
const bankAngle = 14;
const fieldHeight = 190;
const laneWidth = 16;

function Infield() {
  const { width } = useWindowDimensions();
  const trackWidth = Math.max(trackHeight, width * 1.48);
  // Banking a stadium shape raises one end of its straightaway.
  const rise = (trackWidth - trackHeight) / 2 * Math.sin(bankAngle * Math.PI / 180);

  return (
    <View aria-hidden pointerEvents="none" style={s.field}>
      <Image accessible={false} source={require('../../assets/pulse/infield-halftone.png')}
        resizeMode="repeat" style={s.texture} />
      <View style={[s.track, { width: trackWidth, top: 18 + rise }]}>
        <View style={s.runningSurface} />
        {[1, 2, 3].map(lane => (
          <View key={lane} style={[s.marking, { inset: lane * laneWidth }]} />
        ))}
      </View>
      <View style={s.grain}><MenuPaper /></View>
    </View>
  );
}

export default function Home() {
  return (
    <>
      <SafeAreaView edges={['top']} style={s.topInset} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.poster}>
            <Text accessibilityRole="header" style={s.title}>PULSE</Text>
            <Text style={s.subtitle}>Zombie tag with friends</Text>
            <Infield />
          </View>
          <View style={s.actions}>
            <MenuPaper />
            <MenuItem label="Join a game" onPress={() => router.push('/join')} />
            <MenuItem label="Host a game" secondary onPress={() => router.push('/host')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  topInset: { backgroundColor: party.sky },
  screen: { flex: 1, backgroundColor: party.paper },
  content: { flexGrow: 1 },
  poster: { flexGrow: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: party.sky, paddingTop: 28 },
  field: { width: '100%', height: fieldHeight, marginTop: 18, overflow: 'hidden' },
  texture: { width: '100%', height: '100%' },
  track: { position: 'absolute', right: -10, height: trackHeight, transform: [{ rotate: `-${bankAngle}deg` }] },
  runningSurface: { ...StyleSheet.absoluteFill, borderRadius: trackHeight / 2,
    borderWidth: 4 * laneWidth, borderColor: party.orange },
  marking: { position: 'absolute', borderRadius: trackHeight / 2, borderWidth: 2, borderColor: party.paper },
  grain: { ...StyleSheet.absoluteFill, opacity: 0.2 },
  title: { color: party.ink, fontSize: 76, fontWeight: '900', fontStyle: 'italic', letterSpacing: -5 },
  subtitle: { color: party.ink, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  actions: { alignSelf: 'center', width: '100%', maxWidth: 460,
    gap: menuActionLayout.gap, padding: menuActionLayout.inset },
});
