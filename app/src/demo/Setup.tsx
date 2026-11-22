import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useDemoSettings } from './settings';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FieldChoice, FieldToggle, fieldStyles, MenuItem, TrackStripe } from '../ui/Menu';

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
    <ScrollView style={fieldStyles.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TrackStripe />
      <View style={fieldStyles.content}>
        {stage === 'entry' && <>
          <Text accessibilityRole="header" style={fieldStyles.title}>Set up a round</Text>
          <View style={s.row}>
            <FieldChoice label="Host Game" onPress={() => { setHost(true); setError(''); }} selected={host} />
            <FieldChoice label="Join Game" onPress={() => { setHost(false); setError(''); }} selected={!host} />
          </View>
          <Text style={fieldStyles.label}>Player name</Text>
          <TextInput style={fieldStyles.input} accessibilityLabel="Player name" autoCorrect={false} maxLength={32} value={name} onChangeText={setName} />
          {!host && <>
            <Text style={fieldStyles.label}>Room code</Text>
            <TextInput style={fieldStyles.input} accessibilityLabel="Room code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} />
            <Text style={fieldStyles.muted}>Use PULSE to join the demo room.</Text>
          </>}
          {error !== '' && <Text accessibilityRole="alert" style={fieldStyles.error}>{error}</Text>}
          <MenuItem label={host ? 'Create room' : 'Enter room'} onPress={enter} />
        </>}
        {stage === 'lobby' && <>
          <Text style={fieldStyles.kicker}>ROOM CODE</Text>
          <Text accessibilityRole="header" style={fieldStyles.title}>{roomCode}</Text>
          <View style={fieldStyles.panel}>
            <FieldToggle label="I’m ready for calibration" value={ready} onValueChange={setReady} />
            <MenuItem label={host ? 'Start calibration' : 'Continue to calibration'} disabled={!ready}
              onPress={() => { setHeard(0); setStage('calibrate'); }} />
          </View>
          <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>
            {companions.length + Number(ready)} of {companions.length + 1} players ready
          </Text>
          <View style={fieldStyles.panel}>
            {[name.trim(), ...companions.map(player => player.name)].map((player, i) => (
              <View style={[fieldStyles.row, s.item]} key={i}>
                <Text style={fieldStyles.body}>{player}{i === 0 ? ' (you)' : ''}{i === (host ? 0 : 1) ? ' · Host' : ''}</Text>
                <Text style={fieldStyles.muted}>{i === 0 && !ready ? 'Waiting' : 'Ready'}</Text>
              </View>
            ))}
          </View>
          <Text style={fieldStyles.muted}>{settings.durationSec / 60} min round · {settings.disperseSec}s dispersal</Text>
          <MenuItem secondary label={host ? 'Edit game settings' : 'View game settings'} onPress={() => router.push('/game-settings')} />
          <MenuItem secondary label="Leave room" onPress={() => setStage('entry')} />
        </>}
        {stage === 'calibrate' && <>
          <Text accessibilityRole="header" style={fieldStyles.title}>Calibration</Text>
          <Text style={fieldStyles.muted}>Gather together while the demo checks nearby signals.</Text>
          <Text style={fieldStyles.label}>Simulated Bluetooth readings</Text>
          <View style={fieldStyles.panel}>{companions.map((player, i) => (
            <View key={player.name} style={[fieldStyles.row, s.item]}><Text style={fieldStyles.body}>{player.name}</Text><Text style={[fieldStyles.label, s.signal]}>{i < heard ? player.signal : 'Scanning…'}</Text></View>
          ))}</View>
          <Text accessibilityLiveRegion="polite" style={fieldStyles.muted}>{heard} of {companions.length} nearby players detected</Text>
          <MenuItem label="Begin dispersal" disabled={heard !== companions.length}
            onPress={() => { setSeconds(settings.disperseSec); setStage('disperse'); }} />
        </>}
        {stage === 'disperse' && <>
          <Text accessibilityRole="header" style={fieldStyles.title}>Disperse</Text>
          <Text style={fieldStyles.muted}>Move away from the group. Your private role will be ready when the countdown ends.</Text>
          <Text accessibilityLabel={seconds + ' seconds remaining'} style={[fieldStyles.metric, s.number]}>{seconds}</Text>
        </>}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { justifyContent: 'space-between', paddingVertical: 8 },
  signal: { fontVariant: ['tabular-nums'] },
  number: { textAlign: 'center', marginVertical: 36, fontSize: 96, fontVariant: ['tabular-nums'] },
});
