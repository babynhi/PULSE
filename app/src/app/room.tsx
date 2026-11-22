import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Modal, ScrollView, Text } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Header } from 'expo-router/react-navigation';
import { changeIcon, emitAck, leaveGame, send, useGameEvent, useGameStore } from '../net/client';
import { IconPicker } from '../ui/PlayerIcon';
import { Lobby } from '../rooms/Lobby';
import { RoomSettingsForm } from '../rooms/RoomSettingsForm';
import { FieldChoice, fieldStyles, MenuItem } from '../ui/Menu';
import { fieldHeaderOptions, HeaderAction } from '../ui/HeaderAction';

export default function Room() {
  const { view, connected } = useGameStore();
  const [panel, setPanel] = useState<'settings' | 'players' | 'icon' | null>(null);
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
  return <>
    <Lobby roomCode={view.code} players={view.players} youId={view.youId} settings={view.settings}
      onReady={ready => { if (connected) send('lobby:ready', { ready }); }} readyDisabled={!connected}
      onLeave={leaveGame} onSettings={() => setPanel('settings')} onCopy={() => setStringAsync(view.code)}
      onManage={isHost && otherPlayers.length > 0 && connected ? () => setPanel('players') : undefined}
      onChangeIcon={connected ? () => setPanel('icon') : undefined}
      testRole={view.testRole} doctorEnabled={view.settings.doctorEnabled} story={view.story}
      onStory={isHost && view.testTools && connected ? on => {
        emitAck('lobby:story', { on }).then(error => { if (error) setMessage(error); });
      } : undefined}
      onTestRole={isHost && view.testTools && connected ? role => {
        emitAck('lobby:testRole', { role }).then(error => { if (error) setMessage(error); });
      } : undefined}
      onAddDemo={isHost && connected && view.players.length < view.settings.maxPlayers ? () => {
        emitAck('lobby:addDemo').then(error => { if (error) setMessage(error); });
      } : undefined}
      messages={[...view.startBlockers.filter(reason => !reason.startsWith('Waiting for ')), ...view.warnings]}
      error={connected ? message : 'Reconnecting to the room…'} />
    {panel === 'icon' && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={fieldHeaderOptions.headerStyle}>
          <Header {...fieldHeaderOptions} modal headerStatusBarHeight={0} title="Your icon"
            headerLeft={() => <HeaderAction label="Close" accessibilityLabel="Close icon picker" onPress={close} />} />
        </SafeAreaView>
        <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content}>
          <Text style={fieldStyles.body}>Pick an icon nobody else in the room has. Greyed-out ones are taken.</Text>
          <IconPicker value={view.players.find(p => p.id === view.youId)?.icon}
            taken={view.players.filter(p => p.id !== view.youId).map(p => p.icon)}
            onChange={icon => { changeIcon(icon).then(error => { if (error) setMessage(error); else close(); }); }} />
        </ScrollView>
      </SafeAreaProvider>
    </Modal>}
    {(panel === 'settings' || manage) && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={fieldHeaderOptions.headerStyle}>
          <Header {...fieldHeaderOptions} modal headerStatusBarHeight={0}
            title={manage ? 'Manage players' : 'Game settings'} headerLeft={() =>
              <HeaderAction label="Close" accessibilityLabel={manage ? 'Close player management' : 'Close settings'} onPress={close} />} />
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
      </SafeAreaProvider>
    </Modal>}
  </>;
}
