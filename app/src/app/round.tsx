import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { ActionProgress, LatLng, RoomView, Zone } from '../../../shared/protocol';
import { emitAck, leaveGame, send, useGameEvent, useGameStore, useServerNow } from '../net/client';
import { useProxReporter } from '../net/useProxReporter';
import { useLocReporter } from '../net/useLocReporter';
import { Dispersal } from '../rooms/Dispersal';
import { LiveRound } from '../rooms/LiveRound';
import { LiveRecap } from '../rooms/Recap';
import { MapWithRadar } from '../rooms/MapRadar';
import { HeaderAction } from '../ui/HeaderAction';
import { FieldChoice, fieldStyles, MenuItem, party } from '../ui/Menu';

function RoundMap({ room, position, band }: { room: RoomView; position: LatLng | null; band: Zone | 'NONE' }) {
  const now = useServerNow(500);
  const zone = room.zone;
  const grace = room.me?.graceEndsAt;
  const outside = grace != null;
  const returnSecs = grace == null ? null : Math.max(0, Math.ceil((grace - now) / 1000));
  const distance = zone && position ? Math.max(0, Math.round(distanceM(position, zone.center) - zone.radiusM)) : null;
  useEffect(() => {
    if (band === 'HOT') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [band]);
  useEffect(() => {
    if (returnSecs != null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [returnSecs]);
  useEffect(() => {
    if (zone?.warning) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [zone?.warning]);
  useEffect(() => {
    if (room.pingAt) Haptics.selectionAsync().catch(() => {});
  }, [room.pingAt]);

  return <View style={styles.mapPanel}>
    {(outside || zone?.warning) && <Text accessibilityRole="alert" style={[fieldStyles.error, styles.boundary]}>
      {outside ? 'Return to the safe zone · ' + returnSecs + 's' + (distance == null ? '' : ' · ' + distance + ' m to boundary') : 'Zone shrinking soon'}
    </Text>}
    <View style={styles.mapPanel}>
      <MapWithRadar room={room} position={position} now={now} band={band} />
    </View>
  </View>;
}

function distanceM(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Round() {
  const { view, connected, clockOffset } = useGameStore();
  const [bleStatus, setBleStatus] = useState('');
  const updateStatus = useCallback((message: string, healthy?: boolean) => setBleStatus(healthy ? '' : message), []);
  const heard = useProxReporter(updateStatus);
  const tracking = connected && view?.me?.status === 'active' && (view.phase === 'countdown' || view.phase === 'playing');
  const position = useLocReporter(tracking);
  const [progress, setProgress] = useState<ActionProgress | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; informational: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const message = useCallback((text: string, informational = false) => {
    clearTimeout(timer.current);
    setFeedback(text ? { text, informational } : null);
    if (text) timer.current = setTimeout(() => setFeedback(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const boundaryAlert = view?.me?.graceEndsAt != null || !!view?.zone?.warning;
  const phase = view?.phase;
  useEffect(() => {
    if (!phase) router.replace('/');
    else if (phase === 'lobby') router.replace('/room');
  }, [phase]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setLeaving(true); return true; });
    return () => sub.remove();
  }, []);
  useGameEvent('notice', useCallback((notice) => {
    message(notice.text, notice.kind === 'info');
    const danger = notice.kind === 'youWereInfected' || notice.kind === 'eliminated';
    Haptics.notificationAsync(danger ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [message]));
  useGameEvent('progress', useCallback((event) => { setProgress(event); message(''); }, [message]));
  useGameEvent('end', useCallback((event) => {
    setProgress(null);
    if (!event.ok) message(event.reason === 'Released' ? 'Released early. Try holding again.' : event.reason ?? 'Action interrupted.');
  }, [message]));

  // A live boundary warning supersedes its one-off notice, including after the player returns.
  if (boundaryAlert && feedback?.informational) setFeedback(null);
  if (!view || phase === 'lobby') return null;
  const radar = view.radar.map(entry => ({ ...entry, zone: entry.zone ?? view.debugProx[entry.bleId] ?? heard[entry.bleId] }));
  const opponents = radar.filter(entry => !entry.ally).map(entry => entry.zone);
  const nearest = opponents.includes('HOT') ? 'HOT' : opponents.includes('WARM') ? 'WARM' : opponents.includes('COLD') ? 'COLD' : 'NONE';
  const title = phase === 'ended' ? 'Round recap' : phase === 'countdown' ? 'Dispersal' : 'Round';
  return <View style={fieldStyles.page}>
    <Stack.Screen options={{ title, headerShown: true, headerBackVisible: false, gestureEnabled: false,
      headerLeft: () => <HeaderAction label="Leave" accessibilityLabel="Leave game" onPress={() => setLeaving(true)} /> }} />
    {!connected ? <View style={fieldStyles.content}><Text accessibilityRole="alert" style={fieldStyles.heading}>Reconnecting to the room…</Text></View>
      : phase === 'countdown' ? <Dispersal room={view} bluetoothStatus={bleStatus} />
      : phase === 'ended' && view.result ? <LiveRecap result={view.result} name={view.players.find(p => p.id === view.youId)?.name}
          onReplay={() => send('game:playAgain')} />
      : phase === 'playing' ? <LiveRound room={view} clockOffset={clockOffset} radar={radar} bluetoothStatus={bleStatus}
          feedback={feedback?.text ?? ''} actionProgress={progress}
          onRoleAck={() => { message(''); send('game:roleAck'); }}
          onCancelAction={() => send('action:cancel')}
          onStartAction={async id => { const error = await emitAck('action:start', { targetBleId: id }); if (error) throw new Error(error); }}
          zone={<RoundMap room={view} position={position} band={nearest} />} /> : null}
    {leaving && <Modal transparent animationType="fade" onRequestClose={() => setLeaving(false)}>
      <View style={styles.backdrop}><View style={[fieldStyles.panel, styles.dialog]} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={fieldStyles.heading}>Leave the game?</Text>
        {phase !== 'ended' && <Text style={fieldStyles.body}>Leaving takes you out of this round.</Text>}
        <View style={fieldStyles.row}><FieldChoice label="Stay" onPress={() => setLeaving(false)} />
          <MenuItem compact secondary label="Leave game" onPress={() => { setLeaving(false); leaveGame(); }} /></View>
      </View></View>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({
  mapPanel: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: party.panel },
  boundary: { paddingHorizontal: 12, paddingVertical: 6, borderLeftWidth: 4, borderColor: party.alert },
  backdrop: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' },
  dialog: { width: '100%', maxWidth: 400 },
});
