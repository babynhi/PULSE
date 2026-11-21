import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoomView } from '../../../shared/protocol';
import { enterRoom } from './session';

import { background, ink, menuFace, MenuDivider, MenuItem, scriptFace, surface, useMenuFonts } from '../ui/Menu';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const fonts = useMenuFonts();
  const [focused, setFocused] = useState<'name' | 'code' | null>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
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
  if (room) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ headerShown: true }} />
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
        {error !== '' && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </ScrollView>
    );
  }

  const showCode = mode === 'join' || Boolean(rejoinCode);
  const labelStyle = [entry.label, fonts && menuFace];
  return (
    <ImageBackground source={background} style={entry.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={entry.safe}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to main menu"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={({ pressed }) => [entry.back, pressed && entry.pressed]}>
          <Text style={[entry.backText, fonts && menuFace]}>{'\u2039  Back'}</Text>
        </Pressable>
        <ScrollView contentContainerStyle={entry.content} keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets>
          <View style={entry.form}>
            <Text accessibilityRole="header" style={[entry.title, fonts && scriptFace]}>
              {mode === 'host' ? 'Host a Game' : 'Join a Game'}
            </Text>
            <MenuDivider />
            <View style={entry.field}>
              <Text style={labelStyle}>Player name</Text>
              <TextInput accessibilityLabel="Player name" style={[entry.input, focused === 'name' && entry.focus]}
                value={name} onChangeText={setName} editable={!pending} autoCorrect={false}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                returnKeyType={showCode && !rejoinCode ? 'next' : 'go'}
                onSubmitEditing={() => showCode && !rejoinCode ? codeInput.current?.focus() : submit()} />
            </View>
            {showCode && <View style={entry.field}>
              <Text style={labelStyle}>Room code</Text>
              <TextInput ref={codeInput} accessibilityLabel="Room code"
                style={[entry.input, entry.code, focused === 'code' && entry.focus]}
                value={rejoinCode || code} onChangeText={setCode} editable={!pending && !rejoinCode}
                onFocus={() => setFocused('code')} onBlur={() => setFocused(null)}
                autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit} />
            </View>}
            {error !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <View style={entry.actions}>
              <MenuItem label={action} fonts={fonts} disabled={pending} onPress={submit} />
              {rejoinCode !== '' && !pending && <Pressable accessibilityRole="button" style={styles.secondary}
                onPress={() => { setRejoinCode(''); setError(''); }}>
                <Text style={labelStyle}>Use a different room</Text>
              </Pressable>}
              <MenuDivider flipped />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101518' },
  content: { paddingHorizontal: 24, paddingVertical: 32, gap: 12 },
  title: { color: '#F2F5ED', fontWeight: '700', fontSize: 36, marginBottom: 12 },
  heading: { color: '#F2F5ED', fontWeight: '600', fontSize: 22, marginTop: 16 },
  label: { color: '#F2F5ED', fontSize: 18 },
  muted: { color: '#A7B4AF', fontSize: 15 },
  secondary: { minHeight: 48, justifyContent: 'center' },
  link: { color: '#BCFA74', fontSize: 17 },
  row: { gap: 4, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#70847D' },
  error: { color: '#FFB8A8', fontSize: 16 },
});

const entry = StyleSheet.create({
  page: { flex: 1, backgroundColor: surface },
  safe: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)' },
  back: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 24 },
  backText: { color: ink, fontSize: 22 },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  form: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 14 },
  title: { color: ink, fontSize: 58, textAlign: 'center', paddingHorizontal: 8, textShadowColor: surface, textShadowRadius: 10 },
  field: { width: '100%', gap: 4 },
  label: { color: ink, fontSize: 20 },
  input: { minHeight: 48, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.55)',
    color: ink, borderColor: 'rgba(236,236,236,0.55)', borderBottomWidth: 1, fontSize: 19 },
  focus: { borderColor: ink },
  code: { letterSpacing: 3 },
  actions: { alignItems: 'center', marginTop: 12 },
});
