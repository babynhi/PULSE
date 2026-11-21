import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useDemoSettings } from './settings';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

const companions = [
  { name: 'Mara', signal: '−55 dBm' },
  { name: 'Jules', signal: '−62 dBm' },
  { name: 'Remy', signal: '−58 dBm' },
];
const roomCode = 'PULSE';
type Stage = 'entry' | 'lobby' | 'calibrate' | 'disperse';

export default function Setup({ onStart }: { onStart: (name: string) => void }) {
  const [stage, setStage] = useState<Stage>('entry');
  const [host, setHost] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const { settings, openRoom } = useDemoSettings();
  const [seconds, setSeconds] = useState(0);
  const [heard, setHeard] = useState(0);

  useEffect(() => {
    if (stage !== 'calibrate' || heard === companions.length) return;
    const timer = setTimeout(() => setHeard(heard + 1), 500);
    return () => clearTimeout(timer);
  }, [stage, heard]);

  useEffect(() => {
    if (stage !== 'disperse') return;
    if (seconds === 0) {
      onStart(name.trim());
      return;
    }
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [stage, seconds, name, onStart]);

  function enter() {
    if (!name.trim()) return setError('Enter your player name.');
    if (!host && code.trim().toUpperCase() !== roomCode) return setError('Use PULSE to join the demo room.');
    setReady(false);
    openRoom(host);
    setError('');
    setStage('lobby');
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {stage === 'entry' && <>
        <Text accessibilityRole="header" style={s.title}>Set up a round</Text>
        <View style={s.row}>
          <Action label="Host Game" onPress={() => { setHost(true); setError(''); }} selected={host} />
          <Action label="Join Game" onPress={() => { setHost(false); setError(''); }} selected={!host} />
        </View>
        <Text style={s.label}>Player name</Text>
        <TextInput style={s.input} accessibilityLabel="Player name" autoCorrect={false} maxLength={32} value={name} onChangeText={setName} />
        {!host && <>
          <Text style={s.label}>Room code</Text>
          <TextInput style={s.input} accessibilityLabel="Room code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} />
          <Text style={s.muted}>Use PULSE to join the demo room.</Text>
        </>}
        {error !== '' && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Action primary label={host ? 'Create room' : 'Enter room'} onPress={enter} />
      </>}
      {stage === 'lobby' && <>
        <Text style={s.kicker}>ROOM CODE</Text>
        <Text accessibilityRole="header" style={s.title}>{roomCode}</Text>
        <Text style={s.label}>Players · 4</Text>
        <View style={s.panel}>
          {[name.trim(), ...companions.map(player => player.name)].map((player, i) => (
            <View style={s.item} key={i}>
              <Text style={s.body}>{player}{i === 0 ? ' (you)' : ''}{i === (host ? 0 : 1) ? ' · Host' : ''}</Text>
              <Text style={s.muted}>{i === 0 && !ready ? 'Waiting' : 'Ready'}</Text>
            </View>
          ))}
        </View>
        <Text style={s.muted}>{settings.durationSec / 60} min round · {settings.disperseSec}s dispersal</Text>
        <Action label={host ? 'Edit game settings' : 'View game settings'} onPress={() => router.push('/game-settings')} />
        <View style={s.item}><Text style={s.body}>I’m ready</Text><Switch accessibilityLabel="I’m ready" value={ready} onValueChange={setReady} /></View>
        <Action primary label={host ? 'Start calibration' : 'Continue to calibration'} disabled={!ready}
          onPress={() => { setHeard(0); setStage('calibrate'); }} />
        <Action label="Leave room" onPress={() => setStage('entry')} />
      </>}
      {stage === 'calibrate' && <>
        <Text accessibilityRole="header" style={s.title}>Calibration</Text>
        <Text style={s.muted}>Gather together while the demo checks nearby signals.</Text>
        <Text style={s.label}>Simulated Bluetooth readings</Text>
        <View style={s.panel}>{companions.map((player, i) => (
          <View key={player.name} style={s.item}><Text style={s.body}>{player.name}</Text><Text style={s.signal}>{i < heard ? player.signal : 'Scanning…'}</Text></View>
        ))}</View>
        <Text accessibilityLiveRegion="polite" style={s.muted}>{heard} of {companions.length} nearby players detected</Text>
        <Action primary label="Begin dispersal" disabled={heard !== companions.length}
          onPress={() => { setSeconds(settings.disperseSec); setStage('disperse'); }} />
      </>}
      {stage === 'disperse' && <>
        <Text accessibilityRole="header" style={s.title}>Disperse</Text>
        <Text style={s.muted}>Move away from the group. Your private role will be ready when the countdown ends.</Text>
        <Text accessibilityLabel={seconds + ' seconds remaining'} style={s.number}>{seconds}</Text>
      </>}
    </ScrollView>
  );
}

function Action({ label, onPress, primary, disabled, selected }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean; selected?: boolean;
}) {
  const highlighted = primary || selected;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, highlighted && s.active, (disabled || pressed) && s.dim]}>
    <Text style={[s.actionText, highlighted && s.ink]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, gap: 14, padding: 24, backgroundColor: '#101518' },
  title: { fontSize: 40, color: '#F2F5ED', fontWeight: '800' },
  kicker: { fontSize: 14, color: '#BCFA74', fontWeight: '700', letterSpacing: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: '#F2F5ED', fontSize: 18, fontWeight: '700', marginTop: 8 },
  body: { color: '#F2F5ED', fontSize: 17, flexShrink: 1 },
  muted: { color: '#AFBBB6', fontSize: 16, lineHeight: 23 },
  signal: { color: '#BCFA74', fontSize: 16, fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: '#1B2525', paddingHorizontal: 16, borderRadius: 14 },
  item: { paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: { minHeight: 50, padding: 12, borderColor: '#73837D', borderWidth: 1, borderRadius: 10, fontSize: 18, color: '#F2F5ED' },
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#73837D' },
  active: { backgroundColor: '#BCFA74', borderColor: '#BCFA74' },
  dim: { opacity: 0.5 },
  actionText: { color: '#F2F5ED', fontWeight: '700', fontSize: 16 },
  ink: { color: '#152013' },
  error: { color: '#FFB8A8', fontSize: 16 },
  number: { textAlign: 'center', marginVertical: 36, color: '#BCFA74', fontVariant: ['tabular-nums'], fontWeight: '800', fontSize: 96 },
});
