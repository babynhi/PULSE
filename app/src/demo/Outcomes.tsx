import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DemoResult } from './Game';
import { useDemoSettings } from './settings';

const lime = '#BCFA74';
const paper = '#F2F5ED';
const muted = '#BAC7BE';
const coral = '#FFA09A';

function Action({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && { opacity: 0.72 }]}>
    <Text style={[s.buttonText, secondary && { color: paper }]}>{label}</Text>
  </Pressable>;
}

function ZoneMap({ enabled, outside, diameter, showNext }: { enabled: boolean; outside: boolean; diameter: number; showNext: boolean }) {
  return <View accessible accessibilityLabel={enabled ? (outside ? 'Map. You are east of the play area.' : 'Map. You are inside the play area.') : 'Campus map. Play area limits are off.'} style={s.map}>
    {[0, 1, 2, 3, 4, 5, 6].map(i => <View key={i} style={[s.road, { left: i * 62 - 65 }]} />)}
    {[0, 1, 2, 3, 4].map(i => <View key={i} style={[s.crossStreet, { top: i * 65 - 18 }]} />)}
    <Text style={[s.mapLabel, { top: 12, left: 10 }]}>WEST CAMPUS</Text>
    <Text style={[s.mapLabel, { top: 12, right: 12 }]}>▲ N</Text>
    {enabled && <View style={[s.ring, { width: diameter, height: diameter }]}>
      {showNext && <View style={s.nextRing} />}
    </View>}
    <Text style={[s.mapLabel, { bottom: 15, right: 10 }]}>COLLEGE WALK</Text>
    <View style={[s.marker, { left: outside ? '85%' : '44%' }]}><View style={[s.dot, { backgroundColor: outside ? coral : lime }]} /><Text style={s.you}>YOU</Text></View>
  </View>;
}

export function Zone({ showDemoControls, onEliminated }: { showDemoControls: boolean; onEliminated: () => void }) {
  const { settings } = useDemoSettings();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [startedAt] = useState(Date.now);
  useEffect(() => {
    if (!settings.zoneEnabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [settings.zoneEnabled]);
  const outside = settings.zoneEnabled && deadline !== null;
  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  const eliminated = outside && remaining === 0;
  useEffect(() => {
    if (eliminated) onEliminated();
  }, [eliminated, onEliminated]);
  const interval = Math.max(1, settings.zoneShrinkSec);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const shrinks = Math.min(5, Math.floor(elapsed / interval));
  const remainingRadius = Math.pow(0.8, shrinks);
  const radius = Math.round(settings.zoneRadiusM * remainingRadius);
  const nextShrink = interval - elapsed % interval;
  const warning = shrinks < 5 && nextShrink <= settings.zoneWarningSec;
  return <View style={{ gap: 10 }}>
    <Text accessibilityRole="header" style={s.heading}>Map</Text>
    <ZoneMap enabled={settings.zoneEnabled} outside={outside} diameter={186 * remainingRadius} showNext={shrinks < 5} />
    {settings.zoneEnabled ? <>
      <Text style={s.meta}>●  Play area · {radius} m radius{shrinks < 5 ? '      ◌  Next play area' : ''}</Text>
      <View style={[s.panel, outside && { borderColor: coral }]}>
        <Text accessibilityLiveRegion="polite" style={[s.heading, { color: outside ? coral : lime }]}>{outside ? 'Outside the play area' : 'Inside the play area'}</Text>
        {outside && <><Text style={s.detail}>Head west · 18 m to safety</Text><Text style={s.number}>{remaining} s to return</Text></>}
        {warning && <Text style={s.detail}>Play area shrinks in {nextShrink} s</Text>}
      </View>
      {showDemoControls && !eliminated && <Action secondary label={outside ? 'Simulate return to play area' : 'Simulate leaving play area'} onPress={() => {
        const time = Date.now();
        setNow(time);
        setDeadline(outside ? null : time + settings.zoneGraceSec * 1000);
      }} />}
    </> : <Text style={s.meta}>House Party Mode · Play area limits off</Text>}
  </View>;
}

export function Recap({ result, onReplay }: { result: DemoResult; onReplay: () => void }) {
  const [details, setDetails] = useState(false);
  const eliminated = /eliminat/i.test(result.reason);
  const infectedWin = result.winner === 'infected';
  const duration = Math.floor(result.elapsedSec / 60) + ':' + String(result.elapsedSec % 60).padStart(2, '0');
  const rows = [
    [result.name + ' (you)', eliminated ? 'Eliminated' : result.role],
    ...result.standings.map(player => [player.name, player.role]),
  ];
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text style={s.caption}>ROUND RECAP</Text>
    <View style={s.hero}>
      <Text style={[s.title, { color: infectedWin ? coral : lime }]}>{infectedWin ? 'Infected win' : 'Survivors win'}</Text>
      <Text style={s.detail}>{result.reason}</Text>
    </View>
    <View style={s.stats}>{[[duration, 'Duration'], [String(result.bites), 'Your bites'], [String(result.heals), 'Your cures'], [eliminated ? '1' : '0', 'Eliminated']].map(([value, label]) =>
      <View key={label} style={s.stat}><Text style={s.number}>{value}</Text><Text style={s.meta}>{label}</Text></View>)}</View>
    <Text accessibilityRole="header" style={s.heading}>Final standings</Text>
    {rows.map(([player, status], index) => <View key={index} style={s.row}><Text style={s.detail}>{player}</Text><Text style={s.meta}>{status}</Text></View>)}
    <Action secondary label={details ? 'Hide round details' : 'Show round details'} onPress={() => setDetails(!details)} />
    {details && <View style={s.panel}><Text style={s.detail}>Your final role · {result.role}</Text><Text style={s.detail}>Players at round start · {rows.length}</Text><Text style={s.detail}>Round ended at {duration}</Text></View>}
    <Action label="Play again" onPress={onReplay} />
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101518' },
  content: { padding: 20, width: '100%', maxWidth: 520, alignSelf: 'center', gap: 12, paddingBottom: 40 },
  caption: { color: lime, letterSpacing: 2, fontSize: 12, fontWeight: '800' },
  title: { color: paper, fontWeight: '900', fontSize: 43, letterSpacing: -2 },
  heading: { color: paper, fontWeight: '800', fontSize: 23 },
  detail: { color: paper, fontSize: 17, lineHeight: 24 },
  number: { color: paper, fontWeight: '800', fontSize: 27, fontVariant: ['tabular-nums'] },
  meta: { color: muted, fontSize: 13 },
  map: { height: 224, overflow: 'hidden', borderRadius: 12, backgroundColor: '#202E2B', borderColor: '#465951', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  road: { position: 'absolute', top: -90, height: 440, width: 7, backgroundColor: '#364640', transform: [{ rotate: '28deg' }] },
  crossStreet: { position: 'absolute', left: '-15%', width: '130%', height: 5, backgroundColor: '#364640', transform: [{ rotate: '14deg' }] },
  mapLabel: { position: 'absolute', fontSize: 10, letterSpacing: 1.2, color: '#CDDBD0', fontWeight: '700' },
  ring: { width: 186, height: 186, borderRadius: 100, borderWidth: 2, borderColor: lime, backgroundColor: 'rgba(155,206,94,0.11)', alignItems: 'center', justifyContent: 'center' },
  nextRing: { width: '80%', aspectRatio: 1, borderWidth: 2, borderColor: '#D5ECAC', borderStyle: 'dashed', borderRadius: 100 },
  marker: { position: 'absolute', top: '54%', alignItems: 'center', gap: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: paper },
  you: { backgroundColor: '#101518', color: paper, paddingHorizontal: 5, fontSize: 10, fontWeight: '800' },
  panel: { backgroundColor: '#1A2523', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#55675A', gap: 5 },
  button: { minHeight: 46, backgroundColor: lime, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 10 },
  secondary: { borderColor: '#53675C', borderWidth: 1, backgroundColor: '#17201E' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#132014' },
  hero: { paddingVertical: 16, gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, minWidth: '42%', backgroundColor: '#1D2A25', borderRadius: 8, padding: 13, gap: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#4E6156', paddingVertical: 8 },
});
