import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicPlayer, Settings } from '../../../shared/protocol';
import { FieldChoice, fieldStyles, MenuItem, MenuPaper, menuActionLayout, party, TrackStripe } from '../ui/Menu';
import { formatDuration } from '../ui/formatDuration';

type LobbyPlayer = Pick<PublicPlayer, 'id' | 'name' | 'isHost' | 'ready' | 'connected'>;

interface LobbyProps {
  roomCode: string;
  youId: string;
  players: LobbyPlayer[];
  settings: Pick<Settings, 'durationSec' | 'disperseSec'>;
  onSettings: () => void;
  onReady: (ready: boolean) => void;
  onShare?: () => void;
  messages?: string[];
  error?: string;
}

export function Lobby({ roomCode, youId, players, settings, onSettings, onReady, onShare, messages, error }: LobbyProps) {
  const { height } = useWindowDimensions();
  const compact = height < 640;
  const self = players.find(player => player.id === youId);
  const connected = players.filter(player => player.connected);
  const readyCount = connected.filter(player => player.ready).length;

  return (
    <View style={fieldStyles.page}>
      <Stack.Screen options={{ headerShown: true, title: 'PULSE lobby' }} />
      <TrackStripe />
      <SafeAreaView edges={['left', 'right']} style={fieldStyles.page}>
        <ScrollView contentContainerStyle={[s.content, compact && s.compactContent]}>
          <View style={s.sectionRow}>
            <View style={s.codeBlock}>
              <Text style={fieldStyles.label}>Room code</Text>
              <Text selectable accessibilityLabel={`Room code ${roomCode.split('').join(' ')}`} style={s.code}>{roomCode}</Text>
            </View>
            {onShare && <FieldChoice label="Share" accessibilityLabel="Share room code" onPress={onShare} />}
          </View>

          <View style={[s.round, compact && s.compactRound]}>
            <View style={s.timing}>
              <Text style={fieldStyles.muted}>Round length</Text>
              <Text style={fieldStyles.heading}>{formatDuration(settings.durationSec)}</Text>
            </View>
            <View style={s.timing}>
              <Text style={fieldStyles.muted}>Dispersal</Text>
              <Text style={fieldStyles.heading}>{formatDuration(settings.disperseSec)}</Text>
            </View>
            <FieldChoice label="Settings" accessibilityLabel={self?.isHost ? 'Edit game settings' : 'View game settings'} onPress={onSettings} />
          </View>

          <View style={[s.roster, compact && s.compactRoster]}>
            <Text accessibilityRole="header" style={fieldStyles.heading}>Players</Text>
            {players.map(player => {
              const identity = [player.id === youId && 'you', player.isHost && 'host'].filter(Boolean).join(', ');
              return (
                <View key={player.id} style={[s.playerRow, compact && s.compactPlayerRow]}>
                  <Text style={s.playerName}>{player.name}
                    {identity && <Text style={s.identity}>{` · ${identity}`}</Text>}
                  </Text>
                  <Text style={[fieldStyles.label, !player.connected ? s.disconnected : player.ready ? s.ready : s.notReady]}>
                    {!player.connected ? 'Offline' : player.ready ? 'Ready' : 'Not ready'}
                  </Text>
                </View>
              );
            })}
            <View style={s.rosterFooter}>
              <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>{readyCount}/{connected.length} players ready</Text>
              <Text style={fieldStyles.muted}>The round starts when everyone is ready.</Text>
              {messages?.map(message => <Text key={message} style={fieldStyles.error}>{message}</Text>)}
            </View>
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={s.footer}>
          <MenuPaper />
          <View style={s.action}>
            {error ? <Text accessibilityRole="alert" style={fieldStyles.error}>{error}</Text> : null}
            <MenuItem label={self?.ready ? 'Undo ready' : 'Ready'} secondary={self?.ready} disabled={!self?.connected}
              onPress={() => onReady(!self?.ready)} />
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  content: { ...fieldStyles.content, gap: 18 },
  compactContent: { gap: 12, paddingVertical: 10 },
  sectionRow: { ...fieldStyles.row, justifyContent: 'space-between', gap: 12 },
  codeBlock: { flexShrink: 1 },
  code: { ...fieldStyles.title, letterSpacing: 4 },
  round: { ...fieldStyles.row, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingTop: 14, gap: 12 },
  compactRound: { paddingTop: 6 },
  timing: { flexGrow: 1 },
  roster: { ...fieldStyles.panel, gap: 0 },
  compactRoster: { paddingVertical: 10 },
  playerRow: { ...fieldStyles.row, justifyContent: 'space-between', paddingVertical: 8 },
  compactPlayerRow: { paddingVertical: 4 },
  playerName: { ...fieldStyles.body, flexShrink: 1, fontWeight: '900' },
  identity: { ...fieldStyles.muted, fontWeight: '600' },
  ready: { color: party.ready },
  notReady: { color: party.alert },
  disconnected: { color: party.muted },
  rosterFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, marginTop: 4, paddingTop: 10, gap: 4 },
  footer: { backgroundColor: party.paper },
  action: { width: '100%', maxWidth: fieldStyles.content.maxWidth, alignSelf: 'center', padding: menuActionLayout.inset, gap: 6 },
});
