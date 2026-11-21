import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoomView } from '../../../shared/protocol';
import { enterRoom } from './session';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const active = useRef<ReturnType<typeof enterRoom> | null>(null);
  useEffect(() => () => active.current?.(), []);

  function submit() {
    if (pending || active.current) return;
    const playerName = name.trim();
    const roomCode = (rejoinCode || code).trim().toUpperCase();
    const joining = mode === 'join' || Boolean(rejoinCode);
    if (!playerName) return setError('Enter your player name.');
    if (joining && !roomCode) return setError('Enter the room code from your host.');
    setError('');
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
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {room ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>Room {room.code}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={async () => {
            try { await Share.share({ message: 'Join my PULSE room: ' + room.code }); }
            catch { setError('Sharing is unavailable. Give your friends the room code above.'); }
          }}><Text style={styles.link}>Share room code</Text></Pressable>
          <Text style={styles.heading}>Players · {room.players.length}</Text>
          {room.players.map((player) => (
            <View key={player.id} style={styles.row}>
              <Text style={styles.label}>{player.name}{player.id === room.youId ? ' (you)' : ''}{player.isHost ? ' · Host' : ''}</Text>
              <Text style={styles.muted}>{!player.connected ? 'Disconnected' : player.ready ? 'Ready' : 'Waiting'}</Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.title}>{mode === 'host' ? 'Host a game' : 'Join a game'}</Text>
          <Text style={styles.label}>Player name</Text>
          <TextInput accessibilityLabel="Player name" style={styles.input} value={name} onChangeText={setName} editable={!pending} autoCorrect={false} />
          {(mode === 'join' || rejoinCode !== '') && <>
            <Text style={styles.label}>Room code</Text>
            <TextInput accessibilityLabel="Room code" style={styles.input} value={rejoinCode || code}
              onChangeText={(value) => { setCode(value); setRejoinCode(''); }} editable={!pending && !rejoinCode}
              autoCapitalize="characters" autoCorrect={false} />
          </>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: pending, busy: pending }} disabled={pending}
            style={styles.primary} onPress={submit}><Text style={styles.primaryText}>{action}</Text></Pressable>
          {rejoinCode !== '' && !pending && <Pressable accessibilityRole="button" style={styles.secondary}
            onPress={() => { setRejoinCode(''); setError(''); }}><Text style={styles.link}>Use a different room</Text></Pressable>}
        </>
      )}
      {error !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101518' },
  content: { paddingHorizontal: 24, paddingVertical: 32, gap: 12 },
  title: { color: '#F2F5ED', fontWeight: '700', fontSize: 36, marginBottom: 12 },
  heading: { color: '#F2F5ED', fontWeight: '600', fontSize: 22, marginTop: 16 },
  label: { color: '#F2F5ED', fontSize: 18 },
  muted: { color: '#A7B4AF', fontSize: 15 },
  input: { borderWidth: 1, borderColor: '#70847D', borderRadius: 8, padding: 14, color: '#F2F5ED', fontSize: 18 },
  primary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#BCFA74', borderRadius: 8, marginTop: 12 },
  primaryText: { color: '#152013', fontSize: 17, fontWeight: '700' },
  secondary: { minHeight: 48, justifyContent: 'center' },
  link: { color: '#BCFA74', fontSize: 17 },
  row: { gap: 4, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#70847D' },
  error: { color: '#FFB8A8', fontSize: 16 },
});
