import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FieldDisclosure, fieldStyles, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';
import type { DemoResult } from './Game';
import { useDemoSettings } from './settings';

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
    <View style={[s.marker, { left: outside ? '85%' : '44%' }]}><View style={[s.dot, { backgroundColor: outside ? party.orange : party.lime }]} /><Text style={s.you}>YOU</Text></View>
  </View>;
}

export function Zone({ showDemoControls, onEliminated }: { showDemoControls: boolean; onEliminated: () => void }) {
  const { settings } = useDemoSettings();
  const [mapOpen, setMapOpen] = useState(false);
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
  const warning = settings.zoneEnabled && shrinks < 5 && nextShrink <= settings.zoneWarningSec;
  return <View style={[fieldStyles.panel, s.zone, (outside || warning) && s.zoneWarning]}>
    <View style={[fieldStyles.row, s.zoneHeader]}>
      <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>
        {!settings.zoneEnabled ? 'House Party Mode · Play area limits off' : outside ? 'Outside the play area' : 'Inside the play area'}
      </Text>
      <FieldDisclosure label="Map" expanded={mapOpen} onPress={() => setMapOpen(!mapOpen)} />
    </View>
    {outside && <><Text style={fieldStyles.metric}>{remaining} s to return</Text><Text style={fieldStyles.body}>Head west · 18 m to safety</Text></>}
    {warning && <Text accessibilityLiveRegion="polite" style={fieldStyles.body}>Play area shrinks in {nextShrink} s</Text>}
    {mapOpen && <>
      <ZoneMap enabled={settings.zoneEnabled} outside={outside} diameter={186 * remainingRadius} showNext={shrinks < 5} />
      {settings.zoneEnabled && <Text style={fieldStyles.muted}>●  Play area · {radius} m radius{shrinks < 5 ? '      ◌  Next play area' : ''}</Text>}
    </>}
    {showDemoControls && settings.zoneEnabled && !eliminated && <MenuItem secondary label={outside ? 'Simulate return to play area' : 'Simulate leaving play area'} onPress={() => {
        const time = Date.now();
        setNow(time);
        setDeadline(outside ? null : time + settings.zoneGraceSec * 1000);
      }} />}
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
  return <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content}>
    <Text style={fieldStyles.kicker}>ROUND RECAP</Text>
    <View style={[fieldStyles.panel, { backgroundColor: infectedWin ? party.orange : party.lime }]}>
      <MenuPaper />
      <Text accessibilityRole="header" style={fieldStyles.title}>{infectedWin ? 'Infected win' : 'Survivors win'}</Text>
      <Text style={fieldStyles.body}>{result.reason}</Text>
      <Text style={fieldStyles.label}>Your final role · {result.role}</Text>
    </View>
    <MenuItem label="Play again" onPress={onReplay} />
    <TrackStripe />
    <FieldDisclosure label="Round details" expanded={details} onPress={() => setDetails(!details)} />
    {details && <>
      <View style={s.stats}>{[[duration, 'Duration'], [String(result.bites), 'Your bites'], [String(result.heals), 'Your cures'], [eliminated ? '1' : '0', 'Eliminated']].map(([value, label]) =>
      <View key={label} style={[fieldStyles.panel, s.stat]}><Text style={fieldStyles.metric}>{value}</Text><Text style={fieldStyles.muted}>{label}</Text></View>)}</View>
      <Text accessibilityRole="header" style={fieldStyles.heading}>Final standings</Text>
      <Text style={fieldStyles.muted}>Players at round start · {rows.length}</Text>
      {rows.map(([player, status], index) => <View key={index} style={[fieldStyles.row, s.standing]}>
        <Text style={fieldStyles.body}>{player}</Text><Text style={fieldStyles.muted}>{status}</Text>
      </View>)}
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  zone: { paddingVertical: 6 },
  zoneHeader: { justifyContent: 'space-between' },
  zoneWarning: { backgroundColor: party.orange },
  map: { height: 224, overflow: 'hidden', borderRadius: 12, backgroundColor: party.sky, borderColor: party.ink, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center' },
  road: { position: 'absolute', top: -90, height: 440, width: 7, backgroundColor: party.paper, transform: [{ rotate: '28deg' }] },
  crossStreet: { position: 'absolute', left: '-15%', width: '130%', height: 5, backgroundColor: party.paper, transform: [{ rotate: '14deg' }] },
  mapLabel: { position: 'absolute', fontSize: 10, letterSpacing: 1.2, color: party.ink, fontWeight: '700' },
  ring: { borderRadius: 100, borderWidth: 3, borderColor: party.ink, alignItems: 'center', justifyContent: 'center' },
  nextRing: { width: '80%', aspectRatio: 1, borderWidth: 2, borderColor: party.ink, borderStyle: 'dashed', borderRadius: 100 },
  marker: { position: 'absolute', top: '54%', alignItems: 'center', gap: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: party.ink },
  you: { backgroundColor: party.ink, color: party.paper, paddingHorizontal: 5, fontSize: 10, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, minWidth: '42%', gap: 3 },
  standing: { justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingVertical: 8 },
});
