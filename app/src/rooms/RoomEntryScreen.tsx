import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSocket, hostGame, joinGame, useGameStore } from '../net/client';
import { PLAYER_ICONS } from '../../../shared/protocol';
import { IconPicker, PlayerIcon } from '../ui/PlayerIcon';

import { fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const [focused, setFocused] = useState<'name' | 'code' | null>(null);
  const [missing, setMissing] = useState<'name' | 'code' | null>(null);
  const nameInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  // Start on a random icon so a group joining at once rarely collides.
  const [icon, setIcon] = useState(() => PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)]);
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
      if (showCode) await joinGame(playerName, roomCode, icon);
      else await hostGame(playerName, icon);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the game server.');
    } finally {
      setPending(false);
    }
  }

  const action = pending ? (connected ? 'Connecting…' : 'Waking up the server…') : showCode ? 'Join room' : 'Create room';
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={entry.page}>
      <TrackStripe />
      <ScrollView contentContainerStyle={entry.content} keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
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
          <View style={entry.field}>
            <View style={entry.iconHead}>
              <PlayerIcon icon={icon} size={44} ring={party.ink} />
              <Text style={entry.label}>Profile icon</Text>
            </View>
            <Text style={fieldStyles.muted}>Everyone in a room gets a different one.{showCode ? ' If yours is taken you’ll get a free one, and you can change it in the lobby.' : ''}</Text>
            <IconPicker value={icon} onChange={setIcon} disabled={pending} />
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
  );
}

const entry = StyleSheet.create({
  page: fieldStyles.page,
  content: { flexGrow: 1 },
  form: { flexGrow: 1, width: '100%', maxWidth: 468, alignSelf: 'center',
    paddingHorizontal: menuActionLayout.inset, paddingTop: 24, paddingBottom: menuActionLayout.inset, gap: 20 },
  field: { gap: 6 },
  iconHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: fieldStyles.label,
  input: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2,
    borderColor: party.ink, borderRadius: 8, color: party.ink, fontSize: 20 },
  focus: { backgroundColor: party.lime },
  code: { fontWeight: '800', letterSpacing: 3 },
  error: { color: party.ink, borderLeftColor: party.orange, borderLeftWidth: 4,
    paddingLeft: 12, fontSize: 16, fontWeight: '600' },
  actions: { gap: menuActionLayout.gap, marginTop: 'auto', paddingTop: 12 },
});
