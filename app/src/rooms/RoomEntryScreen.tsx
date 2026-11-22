import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoomView } from '../../../shared/protocol';
import { enterRoom } from './session';

import { FieldToggle, fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const [focused, setFocused] = useState<'name' | 'code' | null>(null);
  const [missing, setMissing] = useState<'name' | 'code' | null>(null);
  const nameInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const active = useRef<ReturnType<typeof enterRoom> | null>(null);
  useEffect(() => () => active.current?.leave(), []);

  function submit() {
    if (pending || active.current) return;
    const playerName = name.trim();
    const roomCode = (rejoinCode || code).trim().toUpperCase();
    const joining = mode === 'join' || Boolean(rejoinCode);
    setError('');
    if (!playerName || (joining && !roomCode)) {
      setMissing(playerName ? 'code' : 'name');
      (playerName ? codeInput : nameInput).current?.focus();
      return;
    }
    setMissing(null);
    setPending(true);
    try {
      active.current = enterRoom(
        joining ? { mode: 'join', name: playerName, code: roomCode } : { mode: 'host', name: playerName },
        (state) => { setPending(false); setRoom(state); },
        (message, previousCode) => {
          active.current = null;
          setPending(false);
          setRoom(null);
          setError(message);
          setRejoinCode(previousCode || '');
        },
      );
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : 'Could not open the connection.');
    }
  }

  const action = pending ? 'Connecting…' : rejoinCode ? 'Rejoin room' : mode === 'host' ? 'Create room' : 'Join room';
  if (room) {
    const self = room.players.find(player => player.id === room.youId);
    const guests = room.players.filter(player => player.connected && !player.isHost);
    const lobby = room.phase === 'lobby';
    return (
      <ScrollView style={fieldStyles.page}>
        <Stack.Screen options={{ headerShown: true, title: 'Lobby' }} />
        <TrackStripe />
        <View style={fieldStyles.content}>
          <Text accessibilityRole="header" style={fieldStyles.title}>Room {room.code}</Text>
          {lobby && self?.connected && !self.isHost && (
            <FieldToggle label="I’m ready" value={self.ready} onValueChange={ready => active.current?.setReady(ready)} />
          )}
          <MenuItem label="Share room code" secondary={lobby && !!self && !self.isHost} onPress={async () => {
            setError('');
            try { await Share.share({ message: 'Join my PULSE room: ' + room.code }); }
            catch { setError('Sharing is unavailable. Give your friends the room code above.'); }
          }} />
          {error !== '' && <Text accessibilityRole="alert" style={fieldStyles.error}>{error}</Text>}
          <Text style={fieldStyles.heading}>Players · {room.players.length}</Text>
          <View style={fieldStyles.panel}>
            {lobby && <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>
              {guests.length ? `${guests.filter(player => player.ready).length} of ${guests.length} guests ready` : 'Waiting for players to join'}
            </Text>}
            {room.players.map(player => (
              <View key={player.id} style={entry.rosterRow}>
                <Text style={fieldStyles.label}>{player.name}{player.id === room.youId ? ' (you)' : ''}{player.isHost ? ' · Host' : ''}</Text>
                <Text style={fieldStyles.muted}>{!player.connected ? 'Disconnected' : lobby && player.isHost ? 'Hosting' : player.ready ? 'Ready' : 'Waiting'}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  const showCode = mode === 'join' || Boolean(rejoinCode);
  return (
    <View style={entry.page}>
      <SafeAreaView edges={['top']} style={entry.topInset} />
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={entry.page}>
        <ScrollView contentContainerStyle={entry.content} keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
          <View style={entry.header}>
            <View style={entry.headerInner}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to main menu"
                onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
                style={({ pressed }) => [entry.back, pressed && entry.pressed]}>
                <Text style={entry.backText}>{'\u2039  Back'}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={entry.title}>
                {mode === 'host' ? 'Host a game' : 'Join a game'}
              </Text>
            </View>
          </View>
          <TrackStripe />
          <View style={entry.form}>
            <View style={entry.field}>
              <Text style={entry.label}>Player name</Text>
              <TextInput ref={nameInput} accessibilityLabel="Player name" style={[entry.input, focused === 'name' && entry.focus]}
                value={name} onChangeText={value => { setName(value); if (missing === 'name' && value.trim()) setMissing(null); }}
                editable={!pending} autoCorrect={false}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                returnKeyType={showCode && !rejoinCode ? 'next' : 'go'}
                onSubmitEditing={() => showCode && !rejoinCode ? codeInput.current?.focus() : submit()} />
              {missing === 'name' && <Text accessibilityRole="alert" style={entry.error}>Enter your player name.</Text>}
            </View>
            {showCode && <View style={entry.field}>
              <Text style={entry.label}>Room code</Text>
              <TextInput ref={codeInput} accessibilityLabel="Room code"
                style={[entry.input, entry.code, focused === 'code' && entry.focus]}
                value={rejoinCode || code} onChangeText={value => { setCode(value); if (missing === 'code' && value.trim()) setMissing(null); }}
                editable={!pending && !rejoinCode}
                onFocus={() => setFocused('code')} onBlur={() => setFocused(null)}
                autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit} />
              {missing === 'code' && <Text accessibilityRole="alert" style={entry.error}>Enter the room code from your host.</Text>}
            </View>}
            {error !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={entry.error}>{error}</Text>}
            <View style={entry.actions}>
              <MenuPaper extendToFormEdges />
              <MenuItem label={action} disabled={pending} busy={pending} onPress={submit} />
              {rejoinCode !== '' && !pending && <MenuItem secondary label="Use a different room"
                onPress={() => { setRejoinCode(''); setError(''); }} />}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const entry = StyleSheet.create({
  page: fieldStyles.page,
  rosterRow: { ...fieldStyles.row, justifyContent: 'space-between' },
  topInset: { backgroundColor: party.sky },
  header: { backgroundColor: party.sky, alignItems: 'center', paddingHorizontal: 24 },
  headerInner: { width: '100%', maxWidth: 420 },
  back: { alignSelf: 'flex-start', minHeight: 48, minWidth: 64, justifyContent: 'center' },
  backText: { color: party.ink, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1 },
  form: { flexGrow: 1, width: '100%', maxWidth: 468, alignSelf: 'center',
    paddingHorizontal: menuActionLayout.inset, paddingTop: 24, paddingBottom: menuActionLayout.inset, gap: 20 },
  title: { color: party.ink, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, paddingBottom: 20 },
  field: { gap: 6 },
  label: fieldStyles.label,
  input: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2,
    borderColor: party.ink, borderRadius: 8, color: party.ink, fontSize: 20 },
  focus: { backgroundColor: party.lime },
  code: { fontWeight: '800', letterSpacing: 3 },
  error: { color: party.ink, borderLeftColor: party.orange, borderLeftWidth: 4,
    paddingLeft: 12, fontSize: 16, fontWeight: '600' },
  actions: { gap: menuActionLayout.gap, marginTop: 'auto', paddingTop: 12 },
});
