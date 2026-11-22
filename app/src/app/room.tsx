import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, Share, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { emitAck, leaveGame, send, useGameEvent, useGameStore } from '../net/client';
import { Lobby } from '../rooms/Lobby';
import { RoomSettingsForm } from '../rooms/RoomSettingsForm';
import { FieldChoice, fieldStyles, MenuItem, party } from '../ui/Menu';

export default function Room() {
  const { view, connected } = useGameStore();
  const [panel, setPanel] = useState<'settings' | 'players' | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const close = () => { setPanel(null); setPlayerId(''); };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
  useGameEvent('notice', useCallback(n => { if (n.kind !== 'kicked') setMessage(n.text); }, []));

  if (!view) return <Redirect href="/" />;
  if (view.phase !== 'lobby') return <Redirect href="/round" />;
  const isHost = view.hostId === view.youId;
  const otherPlayers = view.players.filter(player => player.id !== view.youId);
  const selected = otherPlayers.find(player => player.id === playerId);
  const manage = panel === 'players' && isHost;
  const share = async () => {
    try { await Share.share({ message: 'Join my PULSE room: ' + view.code }); }
    catch { setMessage('Sharing is unavailable. Give your friends the room code above.'); }
  };
  return <>
    <Lobby roomCode={view.code} players={view.players} youId={view.youId} settings={view.settings}
      onReady={ready => { if (connected) send('lobby:ready', { ready }); }} readyDisabled={!connected}
      onLeave={leaveGame} onSettings={() => setPanel('settings')} onShare={share}
      onManage={isHost && otherPlayers.length > 0 && connected ? () => setPanel('players') : undefined}
      messages={[...view.startBlockers.filter(reason => !reason.startsWith('Waiting for ')), ...view.warnings]}
      error={connected ? message : 'Reconnecting to the room…'} />
    {(panel === 'settings' || manage) && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'left', 'right']} style={s.header}>
        <Text accessibilityRole="header" style={fieldStyles.heading}>{manage ? 'Manage players' : 'Game settings'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={manage ? 'Close player management' : 'Close settings'}
          onPress={close} style={s.close}><Text style={fieldStyles.label}>Close</Text></Pressable>
      </SafeAreaView>
      {manage ? <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content}>
        {selected ? <>
          <Text accessibilityRole="header" style={fieldStyles.heading}>{selected.name}</Text>
          {!selected.isBot && <MenuItem label={'Make ' + selected.name + ' host'} disabled={!connected || !selected.connected}
            onPress={() => { send('lobby:transferHost', { playerId: selected.id }); close(); }} />}
          <MenuItem secondary label={'Remove ' + selected.name + ' from room'} disabled={!connected}
            onPress={() => { send('lobby:kick', { playerId: selected.id }); close(); }} />
        </> : otherPlayers.map(player =>
          <FieldChoice key={player.id} label={player.name} accessibilityLabel={'Manage ' + player.name} onPress={() => setPlayerId(player.id)} />)}
      </ScrollView> : <RoomSettingsForm settings={view.settings} canEdit={isHost} settingsVersion={view.settingsVersion}
        changedKeys={view.changedKeys} onClose={close} onSave={async patch => {
          if (!connected) throw new Error('Reconnect to save your settings.');
          const error = await emitAck('lobby:settings', { patch });
          if (error) throw new Error(error);
        }} />}
    </Modal>}
  </>;
}

const s = StyleSheet.create({
  header: { ...fieldStyles.row, justifyContent: 'space-between', backgroundColor: party.sky, paddingHorizontal: 20 },
  close: { minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
