import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ActionProgress, RoomView } from '../../../shared/protocol';
import { enterRoom, type RoomSession } from './session';
import { Lobby } from './Lobby';
import { RoomSettingsForm } from './RoomSettingsForm';
import { LiveRound } from './LiveRound';
import { Dispersal } from './Dispersal';
import { LiveRecap } from './Recap';
import { useRoomProximity } from '../net/useProxReporter';

import { fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

export function RoomEntryScreen({ mode }: { mode: 'host' | 'join' }) {
  const [focused, setFocused] = useState<'name' | 'code' | null>(null);
  const [missing, setMissing] = useState<'name' | 'code' | null>(null);
  const nameInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState<ActionProgress | null>(null);
  const [feedback, setFeedback] = useState('');
  const [bluetoothStatus, setBluetoothStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const [session, setSession] = useState<RoomSession | null>(null);
  useEffect(() => () => session?.leave(), [session]);
  const onBluetooth = useCallback((message: string, healthy?: boolean) => {
    setBluetoothStatus(healthy ? '' : message);
  }, []);
  useRoomProximity(room, session?.reportProximity, onBluetooth);

  function submit() {
    if (pending || session) return;
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
      const connection = enterRoom(
        joining ? { mode: 'join', name: playerName, code: roomCode } : { mode: 'host', name: playerName },
        (state) => {
          setPending(false);
          setRoom(state);
          if (state.phase !== 'lobby') setSettingsOpen(false);
          if (state.phase !== 'playing') {
            setProgress(null);
            setFeedback('');
          }
        },
        (message, previousCode) => {
          setSession(null);
          setPending(false);
          setRoom(null);
          setSettingsOpen(false);
          setProgress(null);
          setFeedback('');
          setError(message);
          setRejoinCode(previousCode || '');
        },
        {
          'action:progress': event => { setProgress(event); setFeedback(''); },
          'action:end': event => {
            setProgress(null);
            if (!event.ok) setFeedback(event.reason === 'Released' ? 'Released early. Try holding again.' : event.reason ?? 'Action interrupted.');
          },
          notice: notice => setFeedback(notice.text),
        },
      );
      setSession(connection);
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : 'Could not open the connection.');
    }
  }

  const action = pending ? 'Connecting…' : rejoinCode ? 'Rejoin room' : mode === 'host' ? 'Create room' : 'Join room';
  if (room && session) {
    if (room.phase === 'countdown') return <Dispersal room={room} bluetoothStatus={bluetoothStatus} />;
    if (room.phase === 'playing') return <>
      <Stack.Screen options={{ headerShown: true, title: 'Round' }} />
      <LiveRound room={room} onRoleAck={() => { setFeedback(''); session.acknowledgeRole(); }} onStartAction={session.startAction}
        onCancelAction={session.cancelAction} actionProgress={progress} feedback={feedback} bluetoothStatus={bluetoothStatus} />
    </>;
    if (room.phase === 'ended' && room.result) return <>
      <Stack.Screen options={{ headerShown: true, title: 'Round recap' }} />
      <LiveRecap result={room.result} name={room.players.find(p => p.id === room.youId)?.name}
        onReplay={session.playAgain} />
    </>;
    return (
      <>
      <Lobby roomCode={room.code} youId={room.youId} players={room.players} settings={room.settings}
        onReady={session.setReady} onSettings={() => setSettingsOpen(true)}
        messages={[...room.startBlockers.filter(reason => !reason.startsWith('Waiting for ')), ...room.warnings]}
        error={error} onShare={async () => {
          setError('');
          try { await Share.share({ message: 'Join my PULSE room: ' + room.code }); }
          catch { setError('Sharing is unavailable. Give your friends the room code above.'); }
        }} />
      {settingsOpen && <Modal visible animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setSettingsOpen(false)}>
        <SafeAreaView edges={['top', 'left', 'right']} style={entry.settingsHeader}>
          <Text accessibilityRole="header" style={fieldStyles.heading}>Game settings</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => setSettingsOpen(false)}
            style={entry.back}><Text style={entry.backText}>Close</Text></Pressable>
        </SafeAreaView>
        <RoomSettingsForm settings={room.settings} canEdit={room.youId === room.hostId}
          onSave={session.saveSettings} onClose={() => setSettingsOpen(false)} />
      </Modal>}
      </>
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
  settingsHeader: { ...fieldStyles.row, justifyContent: 'space-between', backgroundColor: party.sky, paddingHorizontal: 20 },
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
