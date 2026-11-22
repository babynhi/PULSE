import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSocket, hostGame, joinGame, useGameStore } from '../net/client';

import { fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const [focused, setFocused] = useState<'name' | 'code' | null>(null);
  const [missing, setMissing] = useState<'name' | 'code' | null>(null);
  const nameInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { view, connected } = useGameStore();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const showCode = mode === 'join';
  useEffect(() => { getSocket(); }, []);
  useEffect(() => {
    if (view) router.replace('/room');
  }, [view]);

  async function submit() {
    if (pending || view) return;
    const playerName = name.trim();
    const roomCode = code.trim().toUpperCase();
    setError('');
    if (!playerName || (showCode && !roomCode)) {
      setMissing(playerName ? 'code' : 'name');
      (playerName ? codeInput : nameInput).current?.focus();
      return;
    }
    setMissing(null);
    setPending(true);
    try {
      if (showCode) await joinGame(playerName, roomCode);
      else await hostGame(playerName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the game server.');
    } finally {
      setPending(false);
    }
  }

  const action = pending ? (connected ? 'Connecting…' : 'Waking up the server…') : showCode ? 'Join room' : 'Create room';
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
                editable={!pending} maxLength={20} autoCorrect={false}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                returnKeyType={showCode ? 'next' : 'go'}
                onSubmitEditing={() => showCode ? codeInput.current?.focus() : submit()} />
              {missing === 'name' && <Text accessibilityRole="alert" style={entry.error}>Enter your player name.</Text>}
            </View>
            {showCode && <View style={entry.field}>
              <Text style={entry.label}>Room code</Text>
              <TextInput ref={codeInput} accessibilityLabel="Room code"
                style={[entry.input, entry.code, focused === 'code' && entry.focus]}
                value={code} onChangeText={value => { setCode(value); if (missing === 'code' && value.trim()) setMissing(null); }}
                editable={!pending}
                onFocus={() => setFocused('code')} onBlur={() => setFocused(null)}
                autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit} />
              {missing === 'code' && <Text accessibilityRole="alert" style={entry.error}>Enter the room code from your host.</Text>}
            </View>}
            {pending && !connected && <Text style={fieldStyles.muted}>The first connection can take up to a minute.</Text>}
            {error !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={entry.error}>{error}</Text>}
            <View style={entry.actions}>
              <MenuPaper extendToFormEdges />
              <MenuItem label={action} disabled={pending} busy={pending} onPress={submit} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const entry = StyleSheet.create({
  page: fieldStyles.page,
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
