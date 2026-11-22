/**
 * Room lobby: share the code, see who's in, Ready up, and the host starts the round.
 * When the server moves past the lobby, everyone is sent to the round screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { emitAck, leaveGame, send, useGameEvent, useGameStore } from '../net/client';
import { C, ui } from '../rooms/ui';
import { LobbySettings } from '../rooms/LobbySettings';

export default function Room() {
  const { view, connected } = useGameStore();
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!view) router.replace('/');
    else if (view.phase !== 'lobby') router.replace('/round');
  }, [view]);

  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => true); return () => sub.remove(); }, []);

  useGameEvent('notice', useCallback((n) => { if (n.kind !== 'kicked') setError(n.text); }, []));

  if (!view) return null;
  const me = view.players.find((p) => p.id === view.youId);
  const isHost = view.hostId === view.youId;

  async function start() {
    setStarting(true);
    setError('');
    const err = await emitAck('game:start');
    setStarting(false);
    if (err) setError(err);
  }

  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: 'Lobby', headerBackVisible: false, gestureEnabled: false }} />
      <Text style={ui.muted}>ROOM CODE</Text>
      <Text style={styles.code} accessibilityLabel={'Room code ' + view.code.split('').join(' ')}>{view.code}</Text>
      <Pressable style={ui.secondary} onPress={() => Share.share({ message: 'Join my PULSE room: ' + view.code }).catch(() => { })}>
        <Text style={ui.secondaryText}>Share room code</Text>
      </Pressable>
      {!connected && <Text style={ui.error}>Reconnecting…</Text>}

      <Text style={ui.heading}>Players · {view.players.length}</Text>
      <View style={ui.card}>
        {view.players.map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {p.name}{p.id === view.youId ? ' (you)' : ''}{p.isBot && !/^bot/i.test(p.name) ? ' · bot' : ''}
            </Text>
            <Text style={[styles.status, { color: p.isHost ? C.red : !p.connected ? C.muted : p.ready ? C.green : C.amber }]}>
              {p.isHost ? 'HOST' : !p.connected ? 'OFFLINE' : p.ready ? 'READY' : 'NOT READY'}
            </Text>
          </View>
        ))}
      </View>

      <LobbySettings view={view} isHost={isHost} />

      {view.debugEnabled && isHost && (
        <Pressable style={ui.secondary} onPress={() => send('debug:addBots', { count: 1 })}>
          <Text style={ui.secondaryText}>+ Add a bot{view.players.length < 3 ? ' (need 3 players)' : ''}</Text>
        </Pressable>
      )}

      {isHost ? (
        <>
          <Pressable disabled={starting || !view.canStart} onPress={start}
            style={({ pressed }) => [ui.primary, (pressed || starting || !view.canStart) && ui.dimmed]}>
            <Text style={ui.primaryText}>{starting ? 'Starting…' : 'START GAME'}</Text>
          </Pressable>
          {view.startBlockers.map((b) => <Text key={b} style={ui.muted}>• {b}</Text>)}
          {view.warnings.map((w) => <Text key={w} style={[ui.muted, { color: C.amber }]}>• {w}</Text>)}
        </>
      ) : (
        <>
          <Pressable onPress={() => send('lobby:ready', { ready: !me?.ready })}
            style={({ pressed }) => [me?.ready ? ui.secondary : ui.primary, pressed && ui.dimmed]}>
            <Text style={me?.ready ? ui.secondaryText : ui.primaryText}>{me?.ready ? "I'm not ready" : "I'M READY"}</Text>
          </Pressable>
          <Text style={ui.muted}>Waiting for the host to start the game.</Text>
        </>
      )}

      {error !== '' && <Text style={ui.error}>{error}</Text>}
      <View style={{ flex: 1 }} />
      <Pressable style={ui.secondary} onPress={leaveGame}>
        <Text style={[ui.secondaryText, { color: C.muted }]}>Leave room</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = {
  code: { color: C.text, fontSize: 52, fontWeight: '900' as const, letterSpacing: 10, marginBottom: 4 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 8, gap: 12 },
  name: { color: C.text, fontSize: 17, flexShrink: 1 },
  status: { fontSize: 13, fontWeight: '800' as const, letterSpacing: 1 },
};
