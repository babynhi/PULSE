import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { FieldChoice, FieldDisclosure, fieldStyles, MenuItem, party } from '../ui/Menu';

function RoundMap({ room, position, band }: { room: RoomView; position: LatLng | null; band: Zone | 'NONE' }) {
  const [open, setOpen] = useState(false);
  const now = useServerNow(500);
  const zone = room.zone;
  const grace = room.me?.graceEndsAt;
  const outside = grace != null;
  const shrink = zone?.shrinksAt;
  const shrinkSecs = shrink == null ? null : Math.max(0, Math.ceil((shrink - now) / 1000));
  const returnSecs = grace == null ? null : Math.max(0, Math.ceil((grace - now) / 1000));
  const distance = zone && position ? Math.max(0, Math.round(distanceM(position, zone.center) - zone.radiusM)) : null;
  useEffect(() => {
    if (band === 'HOT') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [band]);
  const status = !room.settings.zoneEnabled ? 'Open play' : !zone ? 'Waiting for the first GPS fix' :
    shrinkSecs == null ? 'Final safe zone' : 'Safe zone shrinks in ' + Math.floor(shrinkSecs / 60) + ':' + String(shrinkSecs % 60).padStart(2, '0');

  useEffect(() => {
    if (returnSecs != null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [returnSecs]);
  useEffect(() => {
    if (zone?.warning) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [zone?.warning]);
  useEffect(() => {
    if (room.pingAt) Haptics.selectionAsync().catch(() => {});
  }, [room.pingAt]);

  return <View style={[fieldStyles.panel, styles.mapPanel, (outside || zone?.warning) && styles.warning]}>
    {outside && <View accessibilityRole="alert">
      <Text style={fieldStyles.heading}>Return to the safe zone</Text>
      <Text style={fieldStyles.body}>{returnSecs} sec left{distance == null ? '' : ' · ' + distance + ' m to the boundary'}</Text>
    </View>}
    <FieldDisclosure label="Map" summary={status} expanded={open} onPress={() => setOpen(!open)} />
    {open && <View style={styles.map}><MapWithRadar room={room} position={position} now={now} band={band} /></View>}
  </View>;
}

function distanceM(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Round() {
  const { view, connected } = useGameStore();
  const [bleStatus, setBleStatus] = useState('');
  const updateStatus = useCallback((message: string, healthy?: boolean) => setBleStatus(healthy ? '' : message), []);
  const heard = useProxReporter(updateStatus);
  const tracking = connected && view?.me?.status === 'active' && (view.phase === 'countdown' || view.phase === 'playing');
  const position = useLocReporter(tracking);
  const [progress, setProgress] = useState<ActionProgress | null>(null);
  const [feedback, setFeedback] = useState('');
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const message = useCallback((text: string) => {
    clearTimeout(timer.current);
    setFeedback(text);
    if (text) timer.current = setTimeout(() => setFeedback(''), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
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
    message(notice.text);
    const danger = notice.kind === 'youWereInfected' || notice.kind === 'eliminated';
    Haptics.notificationAsync(danger ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [message]));
  useGameEvent('progress', useCallback((event) => { setProgress(event); message(''); }, [message]));
  useGameEvent('end', useCallback((event) => {
    setProgress(null);
    if (!event.ok) message(event.reason === 'Released' ? 'Released early. Try holding again.' : event.reason ?? 'Action interrupted.');
  }, [message]));

  if (!view || phase === 'lobby') return null;
  const radar = view.radar.map(entry => ({ ...entry, zone: entry.zone ?? view.debugProx[entry.bleId] ?? heard[entry.bleId] }));
  const opponents = radar.filter(entry => !entry.ally).map(entry => entry.zone);
  const nearest = opponents.includes('HOT') ? 'HOT' : opponents.includes('WARM') ? 'WARM' : opponents.includes('COLD') ? 'COLD' : 'NONE';
  const title = phase === 'ended' ? 'Round recap' : phase === 'countdown' ? 'Dispersal' : 'Round';
  return <View style={fieldStyles.page}>
    <Stack.Screen options={{ title, headerShown: true, headerBackVisible: false, gestureEnabled: false,
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Leave game" style={styles.leave}
        onPress={() => setLeaving(true)}><Text style={fieldStyles.label}>Leave</Text></Pressable> }} />
    {!connected ? <View style={fieldStyles.content}><Text accessibilityRole="alert" style={fieldStyles.heading}>Reconnecting to the room…</Text></View>
      : phase === 'countdown' ? <Dispersal room={view} bluetoothStatus={bleStatus} />
      : phase === 'ended' && view.result ? <LiveRecap result={view.result} name={view.players.find(p => p.id === view.youId)?.name}
          onReplay={() => send('game:playAgain')} />
      : phase === 'playing' ? <LiveRound room={view} radar={radar} bluetoothStatus={bleStatus} feedback={feedback} actionProgress={progress}
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
  mapPanel: { paddingVertical: 6 },
  map: { height: 248, borderRadius: 8, overflow: 'hidden', backgroundColor: party.panel },
  warning: { borderColor: party.alert, borderWidth: 2, paddingVertical: 12 },
  leave: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' },
  dialog: { width: '100%', maxWidth: 400 },
});
