import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FieldDisclosure, fieldStyles, party } from '../ui/Menu';
import { RoundRecap } from '../rooms/Recap';
import type { DemoResult } from './Game';
import { useDemoSettings } from './settings';

function ZoneMap({ enabled, diameter, showNext }: { enabled: boolean; diameter: number; showNext: boolean }) {
  return <View accessible accessibilityLabel={enabled ? 'Map. You are inside the play area.' : 'Campus map. Play area limits are off.'} style={s.map}>
    {[0, 1, 2, 3, 4, 5, 6].map(i => <View key={i} style={[s.road, { left: i * 62 - 65 }]} />)}
    {[0, 1, 2, 3, 4].map(i => <View key={i} style={[s.crossStreet, { top: i * 65 - 18 }]} />)}
    <Text style={[s.mapLabel, { top: 12, left: 10 }]}>WEST CAMPUS</Text>
    <Text style={[s.mapLabel, { top: 12, right: 12 }]}>▲ N</Text>
    {enabled && <View style={[s.ring, { width: diameter, height: diameter }]}>
      {showNext && <View style={s.nextRing} />}
    </View>}
    <Text style={[s.mapLabel, { bottom: 15, right: 10 }]}>COLLEGE WALK</Text>
    <View style={s.marker}><View style={s.dot} /><Text style={s.you}>YOU</Text></View>
  </View>;
}

export function Zone() {
  const { settings } = useDemoSettings();
  const [mapOpen, setMapOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [startedAt] = useState(Date.now);
  useEffect(() => {
    if (!settings.zoneEnabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [settings.zoneEnabled]);
  const interval = Math.max(1, settings.zoneShrinkSec);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const shrinks = Math.min(5, Math.floor(elapsed / interval));
  const remainingRadius = Math.pow(0.8, shrinks);
  const radius = Math.round(settings.zoneRadiusM * remainingRadius);
  const nextShrink = interval - elapsed % interval;
  const warning = settings.zoneEnabled && shrinks < 5 && nextShrink <= settings.zoneWarningSec;
  return <View style={[fieldStyles.panel, s.zone, warning && s.zoneWarning]}>
    <View style={[fieldStyles.row, s.zoneHeader]}>
      <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>
        {!settings.zoneEnabled ? 'House Party Mode · Play area limits off' : 'Inside the play area'}
      </Text>
      <FieldDisclosure label="Map" expanded={mapOpen} onPress={() => setMapOpen(!mapOpen)} />
    </View>
    {warning && <Text accessibilityLiveRegion="polite" style={fieldStyles.body}>Play area shrinks in {nextShrink} s</Text>}
    {mapOpen && <>
      <ZoneMap enabled={settings.zoneEnabled} diameter={186 * remainingRadius} showNext={shrinks < 5} />
      {settings.zoneEnabled && <Text style={fieldStyles.muted}>●  Play area · {radius} m radius{shrinks < 5 ? '      ◌  Next play area' : ''}</Text>}
    </>}
  </View>;
}

export function Recap({ result, onReplay }: { result: DemoResult; onReplay: () => void }) {
  return <RoundRecap winner={result.winner} reason={result.reason} role={result.role} durationSec={result.elapsedSec}
    totals={[[result.bites, 'Your bites'], [result.heals, 'Your cures']]}
    standings={[
      { name: result.name + ' (you)', status: result.role },
      ...result.standings.map(player => ({ name: player.name, status: player.role })),
    ]} onReplay={onReplay} />;
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
  marker: { position: 'absolute', top: '54%', left: '44%', alignItems: 'center', gap: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: party.ink, backgroundColor: party.lime },
  you: { backgroundColor: party.ink, color: party.paper, paddingHorizontal: 5, fontSize: 10, fontWeight: '800' },
});
