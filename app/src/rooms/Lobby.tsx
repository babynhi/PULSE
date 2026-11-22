import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicPlayer, Role, Settings } from '../../../shared/protocol';
import { FieldChoice, fieldStyles, MenuItem, MenuPaper, menuActionLayout, party, TrackStripe } from '../ui/Menu';
import { formatDuration } from '../ui/formatDuration';
import { HeaderAction } from '../ui/HeaderAction';
import { PlayerIcon } from '../ui/PlayerIcon';

type LobbyPlayer = Pick<PublicPlayer, 'id' | 'name' | 'isHost' | 'ready' | 'connected'> & Partial<Pick<PublicPlayer, 'isBot' | 'isDemo' | 'icon'>>;

interface LobbyProps {
  roomCode: string;
  youId: string;
  players: LobbyPlayer[];
  settings: Pick<Settings, 'durationSec' | 'disperseSec'>;
  onSettings: () => void;
  onReady: (ready: boolean) => void;
  onCopy?: () => Promise<boolean>;
  onLeave?: () => void;
  onManage?: () => void;
  /** Host only: adds 3 simulated demo players. */
  onAddDemo?: () => void;
  /** Opens the icon picker for your own icon. */
  onChangeIcon?: () => void;
  /** Host, demo rooms only: the role to start the next round as (null = random). */
  testRole?: Role | null;
  onTestRole?: (role: Role | null) => void;
  /** Host, demo rooms only: Story mode (scripted demo). */
  story?: boolean;
  onStory?: (on: boolean) => void;
  doctorEnabled?: boolean;
  readyDisabled?: boolean;
  messages?: string[];
  error?: string;
}

export function Lobby({ roomCode, youId, players, settings, onSettings, onReady, onCopy, onLeave,
  onManage, onAddDemo, onChangeIcon, testRole, onTestRole, story, onStory, doctorEnabled = true, readyDisabled, messages, error }: LobbyProps) {
  const { height } = useWindowDimensions();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 3000);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const copyCode = async () => {
    try {
      setCopyStatus(await onCopy?.() ? 'copied' : 'failed');
    } catch {
      setCopyStatus('failed');
    }
  };
  const compact = height < 640;
  const self = players.find(player => player.id === youId);
  const connected = players.filter(player => player.connected);
  const readyCount = connected.filter(player => player.ready).length;

  return (
    <View style={fieldStyles.page}>
      <Stack.Screen options={{ headerShown: true, title: 'PULSE lobby', ...(onLeave && {
        headerBackVisible: false, gestureEnabled: false, headerLeft: () =>
          <HeaderAction label="Leave" accessibilityLabel="Leave room" onPress={onLeave} />,
      }) }} />
      <TrackStripe />
      <SafeAreaView edges={['left', 'right']} style={fieldStyles.page}>
        <ScrollView contentContainerStyle={[s.content, compact && s.compactContent]}>
          <View style={s.sectionRow}>
            <View style={s.codeBlock}>
              <Text style={fieldStyles.label}>Room code</Text>
              <Text selectable accessibilityLabel={`Room code ${roomCode.split('').join(' ')}`} style={s.code}>{roomCode}</Text>
            </View>
            {onCopy && <FieldChoice label={copyStatus === 'copied' ? 'Copied!' : 'Copy'}
              accessibilityLabel={copyStatus === 'copied' ? 'Room code copied' : 'Copy room code'} onPress={copyCode} />}
          </View>
          {copyStatus === 'failed' && <Text accessibilityRole="alert" style={fieldStyles.error}>
            Couldn’t copy. Select the room code to copy it manually.
          </Text>}

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
            <View style={s.sectionRow}>
              <Text accessibilityRole="header" style={fieldStyles.heading}>Players</Text>
              {onManage && <Pressable accessibilityRole="button" accessibilityLabel="Manage players" style={s.textButton} onPress={onManage}>
                <Text style={fieldStyles.label}>Manage</Text>
              </Pressable>}
            </View>
            {players.map(player => {
              const identity = [player.id === youId && 'you', player.isHost && 'host', player.isDemo ? 'demo' : player.isBot && !/^bot/i.test(player.name) && 'bot'].filter(Boolean).join(', ');
              return (
                <View key={player.id} style={[s.playerRow, compact && s.compactPlayerRow]}>
                  {player.icon && (player.id === youId && onChangeIcon
                    ? <Pressable accessibilityRole="button" accessibilityLabel="Change your icon" onPress={onChangeIcon} style={s.iconButton}>
                        <PlayerIcon icon={player.icon} size={34} ring={party.orange} />
                        <Text style={s.iconHint}>Change</Text>
                      </Pressable>
                    : <PlayerIcon icon={player.icon} size={34} />)}
                  <Text style={s.playerName}>{player.name}
                    {identity && <Text style={s.identity}>{` · ${identity}`}</Text>}
                  </Text>
                  <Text style={[fieldStyles.label, !player.connected ? s.disconnected : player.ready ? s.ready : s.notReady]}>
                    {!player.connected ? 'Offline' : player.ready ? 'Ready' : 'Not ready'}
                  </Text>
                </View>
              );
            })}
            {onTestRole && <View style={s.testRole}>
              <Text style={fieldStyles.label}>Test my role</Text>
              <Text style={fieldStyles.muted}>Demo rooms only. Pick the role you start the round with.</Text>
              <View style={s.testChoices} accessibilityRole="radiogroup">
                {([null, 'innocent', 'doctor', 'infected'] as (Role | null)[]).filter(r => r !== 'doctor' || doctorEnabled).map(r => {
                  const on = (testRole ?? null) === r;
                  return <Pressable key={r ?? 'random'} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    onPress={() => onTestRole(r)} style={[s.testChip, on && s.testChipOn]}>
                    <Text style={[fieldStyles.label, s.testChipText]}>{r ? r[0].toUpperCase() + r.slice(1) : 'Random'}</Text>
                  </Pressable>;
                })}
              </View>
              {onStory && <>
                <Text style={[fieldStyles.label, s.storyLabel]}>Story mode</Text>
                <Text style={fieldStyles.muted}>{story
                  ? (testRole === 'doctor' ? 'Doctor: an infected walks up to you at 10 s and waits for your cure.'
                    : testRole === 'innocent' ? 'Innocent: bitten at 20 s, cured by the doctor at 40 s, survivors win at 50 s.'
                    : 'Pick Innocent or Doctor for a scripted story. Otherwise demo players just won’t bite or heal.')
                  : 'Demo players follow a fixed, timed storyline. Great for a stage demo.'}</Text>
                <View style={s.testChoices} accessibilityRole="radiogroup">
                  {[false, true].map(on => <Pressable key={String(on)} accessibilityRole="radio" accessibilityState={{ checked: !!story === on }}
                    onPress={() => onStory(on)} style={[s.testChip, !!story === on && s.testChipOn]}>
                    <Text style={[fieldStyles.label, s.testChipText]}>{on ? 'On' : 'Off'}</Text>
                  </Pressable>)}
                </View>
              </>}
            </View>}
            <View style={s.rosterFooter}>
              <Text accessibilityLiveRegion="polite" style={fieldStyles.label}>{readyCount}/{connected.length} players ready</Text>
              <Text style={fieldStyles.muted}>The round starts when everyone is ready.</Text>
              {messages?.map(message => <Text key={message} style={fieldStyles.error}>{message}</Text>)}
              {onAddDemo && <View style={s.demo}>
                <FieldChoice label="+ Add 3 demo players" accessibilityLabel="Add 3 demo players" onPress={onAddDemo} />
                <Text style={fieldStyles.muted}>Demo: simulated players who walk around near you.</Text>
              </View>}
            </View>
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={s.footer}>
          <MenuPaper />
          <View style={s.action}>
            {error ? <Text accessibilityRole="alert" style={fieldStyles.error}>{error}</Text> : null}
            <MenuItem label={self?.ready ? 'Undo ready' : 'Ready'} secondary={self?.ready} disabled={!self?.connected || readyDisabled}
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
  textButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  code: { ...fieldStyles.title, letterSpacing: 4 },
  round: { ...fieldStyles.row, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingTop: 14, gap: 12 },
  compactRound: { paddingTop: 6 },
  timing: { flexGrow: 1 },
  roster: { ...fieldStyles.panel, gap: 0 },
  compactRoster: { paddingVertical: 10 },
  playerRow: { ...fieldStyles.row, justifyContent: 'space-between', alignItems: 'center', columnGap: 10, paddingVertical: 8 },
  compactPlayerRow: { paddingVertical: 4 },
  playerName: { ...fieldStyles.body, flex: 1, flexShrink: 1, fontWeight: '900' },
  testRole: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line },
  testChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testChip: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 20, borderWidth: 2, borderColor: party.ink },
  testChipOn: { backgroundColor: party.lime },
  testChipText: { fontSize: 15 },
  storyLabel: { marginTop: 8 },
  iconButton: { alignItems: 'center', gap: 1 },
  iconHint: { color: party.ink, fontSize: 10, fontWeight: '800' },
  identity: { ...fieldStyles.muted, fontWeight: '600' },
  ready: { color: party.ready },
  notReady: { color: party.alert },
  disconnected: { color: party.muted },
  rosterFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, marginTop: 4, paddingTop: 10, gap: 4 },
  demo: { marginTop: 6, gap: 4, alignItems: 'flex-start' },
  footer: { backgroundColor: party.paper },
  action: { width: '100%', maxWidth: fieldStyles.content.maxWidth, alignSelf: 'center', padding: menuActionLayout.inset, gap: 6 },
});
