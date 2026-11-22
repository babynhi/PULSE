import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { ActionProgress, LatLng, RoomView, Zone } from '../../../shared/protocol';
import { emitAck, leaveGame, send, useGameEvent, useGameStore, useServerNow } from '../net/client';
import { useProxReporter } from '../net/useProxReporter';
import { useLocReporter } from '../net/useLocReporter';
import { Dispersal } from '../rooms/Dispersal';
import { LiveRound } from '../rooms/LiveRound';
import { LiveRecap } from '../rooms/Recap';
import { MapWithRadar } from '../rooms/MapRadar';
import { HeaderAction } from '../ui/HeaderAction';
import { DangerPulse } from '../rooms/DangerPulse';
import { KillFeed } from '../rooms/KillFeed';
import { alertInBackground, prepareAlerts } from '../net/alerts';
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
  const live = phase === 'countdown' || phase === 'playing';
  const danger = view?.me?.danger ?? null;
  // Cured: the role went from infected back to a survivor role. Show it loud and clear.
  const myRole = phase === 'playing' ? view?.me?.role ?? null : null;
  const [cured, setCured] = useState(false);
  const [lastRole, setLastRole] = useState(myRole);
  if (lastRole !== myRole) {
    // Derived during render (not in an effect) so the screen appears on the same frame.
    setLastRole(myRole);
    if (lastRole === 'infected' && myRole && myRole !== 'infected') setCured(true);
    else if (myRole === 'infected') setCured(false);
  }
  useEffect(() => {
    if (cured) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [cured]);
  const closeCured = useCallback(() => {
    setCured(false);
    // The cure resets the role card; this screen already told them, so skip it.
    send('game:roleAck');
  }, []);
  const serverNowForCure = useServerNow(1000);
  const immuneSecs = Math.max(0, Math.ceil(((view?.me?.immuneUntil ?? 0) - serverNowForCure) / 1000));
  // Screen stays on during a round; alerts get permission at the start.
  useEffect(() => {
    if (!live) return;
    activateKeepAwakeAsync('pulse-round').catch(() => { });
    void prepareAlerts();
    return () => { deactivateKeepAwake('pulse-round').catch(() => { }); };
  }, [live]);
  // Locked phone / app in background: lock-screen alerts instead of the in-app UI.
  useEffect(() => {
    if (phase === 'playing' && (danger === 'WARM' || danger === 'HOT')) {
      void alertInBackground('danger', danger === 'HOT' ? '🧟 Infected right next to you!' : '🧟 Infected nearby!', 'Move! Someone infected is close.');
    }
  }, [danger, phase]);
  // Someone was infected: lock-screen alert when backgrounded (the in-app banner is KillFeed).
  const lastFeed = view?.feed?.at(-1);
  const seenFeed = useRef(lastFeed?.id ?? 0);
  useEffect(() => {
    if (!lastFeed || lastFeed.id <= seenFeed.current) return;
    seenFeed.current = lastFeed.id;
    if (phase === 'playing' && lastFeed.kind === 'infected') {
      const left = lastFeed.survivorsLeft == null ? '' : ` ${lastFeed.infectedLeft} infected, ${lastFeed.survivorsLeft} ${lastFeed.survivorsLeft === 1 ? 'survivor' : 'survivors'} left.`;
      void alertInBackground('someoneInfected', '🧟 Someone was infected', ('Stay alert.' + left).trim());
    }
  }, [lastFeed, phase]);
  useEffect(() => {
    if (view?.zone?.warning) void alertInBackground('zoneWarning', '⚠️ Zone shrinking soon', 'The safe zone is about to shrink. Head toward the middle.');
  }, [view?.zone?.warning]);
  useEffect(() => {
    if (view?.me?.graceEndsAt != null) void alertInBackground('outsideZone', '🚨 Get back in the zone!', 'You\'re outside the safe zone. Get back in or you\'re out.');
  }, [view?.me?.graceEndsAt]);
  useEffect(() => {
    if (!phase) router.replace('/');
    else if (phase === 'lobby') router.replace('/room');
  }, [phase]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setLeaving(true); return true; });
    return () => sub.remove();
  }, []);
  useGameEvent('notice', useCallback((notice) => {
    if (notice.kind === 'youWereInfected') void alertInBackground('infected', '🧟 You\'ve been infected!', 'You are INFECTED now. Hunt the survivors.');
    else if (notice.kind === 'youWereCured') void alertInBackground('cured', '💉 You\'ve been cured', notice.text);
    else if (notice.kind === 'eliminated') void alertInBackground('eliminated', '☠️ You\'re out', notice.text);
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
    {phase === 'playing' && view.me?.status === 'active' && <DangerPulse danger={danger} level={view.me?.dangerLevel} />}
    {cured && <Modal transparent animationType="fade" onRequestClose={closeCured}>
      <View style={styles.curedBackdrop} accessibilityViewIsModal>
        <Text style={styles.curedIcon}>💉</Text>
        <Text accessibilityRole="header" style={styles.curedTitle}>You’ve been cured!</Text>
        <Text style={styles.curedBody}>You’re an innocent survivor again. Stay away from the infected until the clock runs out.</Text>
        {immuneSecs > 0 && <Text style={styles.curedBody}>Protected from bites for {immuneSecs}s</Text>}
        <MenuItem label="Back to the game" onPress={closeCured} />
      </View>
    </Modal>}
    {phase === 'playing' && <View pointerEvents="none" style={styles.feed}><KillFeed feed={view.feed} /></View>}
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
  feed: { position: 'absolute', left: 0, right: 0, top: 70 },
  mapPanel: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: party.panel },
  boundary: { paddingHorizontal: 12, paddingVertical: 6, borderLeftWidth: 4, borderColor: party.alert },
  backdrop: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' },
  dialog: { width: '100%', maxWidth: 400 },
  curedBackdrop: { flex: 1, padding: 28, gap: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: party.lime },
  curedIcon: { fontSize: 72 },
  curedTitle: { ...fieldStyles.title, textAlign: 'center' },
  curedBody: { ...fieldStyles.body, textAlign: 'center', maxWidth: 360 },
});
