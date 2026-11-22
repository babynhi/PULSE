import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { getSocket, hostGame, joinGame, useGameStore } from '../net/client';
import { ui } from './ui';

/** Host or join: enter a name (and a code), then go to the room lobby. */
export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const { view, connected } = useGameStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Start connecting right away so a sleeping server begins waking up.
  useEffect(() => { getSocket(); }, []);
  // Already in a room (e.g. the ack came back late): go straight to it.
  useEffect(() => { if (view) router.replace('/room'); }, [view]);

  async function submit() {
    if (pending) return;
    const playerName = name.trim();
    const roomCode = code.trim().toUpperCase();
    if (!playerName) return setError('Enter your player name.');
    if (mode === 'join' && !roomCode) return setError('Enter the room code from your host.');
    setError('');
    setPending(true);
    try {
      if (mode === 'host') await hostGame(playerName);
      else await joinGame(playerName, roomCode);
      // Navigation happens in the [view] effect once the room state arrives.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the game server.');
    } finally {
      setPending(false);
    }
  }

  const action = pending ? (connected ? 'Connecting…' : 'Waking up the server…') : mode === 'host' ? 'Create room' : 'Join room';
  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={ui.title}>{mode === 'host' ? 'Host a game' : 'Join a game'}</Text>
      <Text style={ui.label}>Player name</Text>
      <TextInput accessibilityLabel="Player name" style={ui.input} value={name} onChangeText={setName} editable={!pending}
        autoCorrect={false} maxLength={20} returnKeyType={mode === 'host' ? 'go' : 'next'} onSubmitEditing={mode === 'host' ? submit : undefined} />
      {mode === 'join' && <>
        <Text style={ui.label}>Room code</Text>
        <TextInput accessibilityLabel="Room code" style={[ui.input, styles.code]} value={code} onChangeText={setCode}
          editable={!pending} autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit} />
      </>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: pending, busy: pending }} disabled={pending}
        style={({ pressed }) => [ui.primary, (pressed || pending) && ui.dimmed]} onPress={submit}>
        <Text style={ui.primaryText}>{action}</Text>
      </Pressable>
      {pending && !connected && <Text style={ui.muted}>The free server sleeps when nobody plays. The first connection can take up to a minute.</Text>}
      {error !== '' && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 24, letterSpacing: 6, fontWeight: '700' },
});
