/**
 * The round: scatter countdown, secret role reveal, Bluetooth radar, hold to bite/heal,
 * and the results screen. The server referees everything; this screen only shows the
 * RoomView and asks the server to start/cancel actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { ActionProgress, Role, RoomView, Zone } from '../../../shared/protocol';
import { emitAck, leaveGame, send, useGameEvent, useGameStore, useServerNow } from '../net/client';
import { useProxReporter } from '../net/useProxReporter';
import { C, ui } from '../rooms/ui';
import { MapWithRadar, radarText } from '../rooms/MapRadar';
import { AllyPins, PingDots, ZoneOverlay } from '../rooms/ZoneLayer';
import { useLocReporter } from '../net/useLocReporter';

const RADAR_SIZE = Math.min(Dimensions.get('window').width - 80, 300);

const ROLE_INFO: Record<Role, { name: string; color: string; goal: string }> = {
  infected: { name: 'INFECTED', color: C.red, goal: 'Find survivors and hold the button when you are right next to them to infect them.' },
  doctor: { name: 'DOCTOR', color: C.green, goal: 'Find the infected and hold the button next to them to cure them.' },
  innocent: { name: 'INNOCENT', color: '#7fb3ff', goal: 'Survive until the timer runs out. Stay away from anyone who gets too close.' },
};

const RADAR: Record<Zone | 'NONE', { text: string; color: string }> = {
  HOT: { text: 'YOU ARE NOT ALONE!', color: C.red },
  WARM: { text: 'Movements detected', color: C.amber },
  COLD: { text: "It's quiet...", color: C.muted },
  NONE: { text: "It's quiet...", color: C.muted },
};

const rank = (z?: Zone) => (z === 'HOT' ? 2 : z === 'WARM' ? 1 : 0);

export default function Round() {
  const { view, connected } = useGameStore();
  const [bleStatus, setBleStatus] = useState('');
  const heard = useProxReporter(setBleStatus);
  const myPos = useLocReporter(view?.phase === 'countdown' || view?.phase === 'playing');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!view) router.replace('/');
    else if (view.phase === 'lobby') router.replace('/room');
  }, [view]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  // Android back must not drop you out of a live round.
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => true); return () => sub.remove(); }, []);

  useGameEvent('notice', useCallback((n) => {
    showToast(n.text);
    Haptics.notificationAsync(
      n.kind === 'youWereInfected' || n.kind === 'eliminated' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
    ).catch(() => { });
  }, [showToast]));

  if (!view) return null;
  if (view.phase === 'playing' && view.me?.role && view.me.roleAcked) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Playing view={view} heard={heard} bleStatus={bleStatus} onError={showToast} toast={toast} myPos={myPos} />
        {!connected && <Text style={[ui.error, { position: 'absolute', top: 54, alignSelf: 'center' }]}>Connection lost — reconnecting…</Text>}
      </View>
    );
  }
  return (
    <ScrollView style={ui.page} contentContainerStyle={[ui.content, { paddingTop: 64 }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {!connected && <Text style={[ui.error, { textAlign: 'center' }]}>Connection lost — reconnecting…</Text>}
      {view.phase === 'countdown' && <Countdown view={view} />}
      {view.phase === 'playing' && <Playing view={view} heard={heard} bleStatus={bleStatus} onError={showToast} toast="" myPos={myPos} />}
      {view.phase === 'ended' && <Ended view={view} />}
      {toast !== '' && (
        <View style={[ui.card, { borderWidth: 1, borderColor: C.red }]}>
          <Text style={{ color: C.text, fontSize: 16, textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Countdown({ view }: { view: RoomView }) {
  const now = useServerNow(200);
  const secs = view.countdownEndsAt ? Math.max(0, Math.ceil((view.countdownEndsAt - now) / 1000)) : 0;
  return (
    <View style={{ alignItems: 'center', gap: 16, marginTop: 60 }}>
      <Text style={{ color: C.red, fontSize: 44, fontWeight: '900', letterSpacing: 2 }}>SCATTER!</Text>
      <Text style={{ color: C.text, fontSize: 110, fontWeight: '900' }}>{secs}</Text>
      <Text style={[ui.muted, { textAlign: 'center' }]}>Spread out and hide. Roles are revealed when the timer hits zero.</Text>
      {view.debugEnabled && view.hostId === view.youId && (
        <Pressable style={[ui.secondary, { alignSelf: 'stretch' }]} onPress={() => send('debug:skip')}>
          <Text style={ui.secondaryText}>Skip countdown</Text>
        </Pressable>
      )}
    </View>
  );
}

function Playing({ view, heard, bleStatus, onError, toast, myPos }: {
  view: RoomView; heard: Record<number, Zone>; bleStatus: string; onError: (t: string) => void; toast: string;
  myPos: { lat: number; lng: number } | null;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const now = useServerNow(100);
  const me = view.me;
  const [revealed, setRevealed] = useState(false);
  const [peek, setPeek] = useState(false);
  const [action, setAction] = useState<ActionProgress | null>(null);
  const holding = useRef(false);

  useGameEvent('progress', useCallback((p) => setAction(p), []));
  useGameEvent('end', useCallback((e) => {
    setAction(null);
    if (e.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    else if (e.reason && e.reason !== 'Released') onError(e.reason);
  }, [onError]));

  // A new role (e.g. you got bitten) must be revealed again.
  useEffect(() => { if (me?.roleAcked) setRevealed(false); }, [me?.roleAcked]);

  // Closest player I could act on, from real Bluetooth or the debug panel's fake distances.
  const targets = view.radar
    .filter((r) => !r.ally)
    .map((r) => ({ bleId: r.bleId, zone: view.debugProx[r.bleId] ?? heard[r.bleId] }))
    .sort((a, b) => rank(b.zone) - rank(a.zone));
  const closest = targets[0];
  const zone: Zone | 'NONE' = closest?.zone ?? 'NONE';

  // The hold button only shows while someone is in action range (HOT, what the server accepts).
  // It stays 1.5 s after they drop out so signal flicker doesn't make it blink, and never hides mid-hold.
  const canActNow = !!me?.roleAcked && me.status !== 'eliminated' && (me.role === 'infected' || (me.role === 'doctor' && me.healsLeft > 0));
  const inRange = targets.some((t) => t.zone === 'HOT');
  const [pressing, setPressing] = useState(false);
  const [showHold, setShowHold] = useState(false);
  useEffect(() => {
    if (!canActNow) { setShowHold(false); return; }
    if (inRange || pressing) { setShowHold(true); return; }
    const t = setTimeout(() => setShowHold(false), 1500);
    return () => clearTimeout(t);
  }, [canActNow, inRange, pressing]);
  const holdAnim = useRef(new Animated.Value(0)).current;
  const [holdMounted, setHoldMounted] = useState(false);
  useEffect(() => {
    if (showHold) {
      setHoldMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      Animated.timing(holdAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(holdAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => { if (finished) setHoldMounted(false); });
    }
  }, [showHold, holdAnim]);

  const lastZone = useRef(zone);
  useEffect(() => {
    if (zone === 'HOT' && lastZone.current !== 'HOT') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => { });
    lastZone.current = zone;
  }, [zone]);

  // Safe zone: buzz every second while outside, warn before a shrink, and on each ping.
  const graceLeft = me?.graceEndsAt ? Math.max(0, Math.ceil((me.graceEndsAt - now) / 1000)) : null;
  useEffect(() => {
    if (graceLeft !== null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => { });
  }, [graceLeft]);
  const zoneWarning = !!view.zone?.warning;
  useEffect(() => {
    if (zoneWarning) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
  }, [zoneWarning]);
  useEffect(() => {
    if (view.pingAt) Haptics.selectionAsync().catch(() => { });
  }, [view.pingAt]);

  if (!me || !me.role) return <Text style={ui.muted}>Waiting for your role…</Text>;
  const info = ROLE_INFO[me.role];
  const eliminated = me.status === 'eliminated';
  const left = view.endsAt ? Math.max(0, Math.ceil((view.endsAt - now) / 1000)) : 0;
  const allies = view.radar.filter((r) => r.ally && r.name).map((r) => r.name);
  const canAct = !eliminated && (me.role === 'infected' || (me.role === 'doctor' && me.healsLeft > 0));
  const verb = me.role === 'doctor' ? 'HEAL' : 'INFECT';
  const pct = action ? Math.min(1, Math.max(0, (now - action.startedAt) / action.durationMs)) : 0;

  // ----- Secret role reveal -----
  if (!me.roleAcked) {
    return (
      <View style={{ gap: 16, marginTop: 30 }}>
        <Text style={[ui.title, { textAlign: 'center' }]}>Your secret role</Text>
        {!revealed ? (
          <Pressable style={[ui.card, styles.reveal]} onPress={() => { setRevealed(true); Haptics.selectionAsync().catch(() => { }); }}>
            <Text style={{ color: C.muted, fontSize: 18, textAlign: 'center' }}>Make sure nobody is looking.{'\n\n'}Tap to reveal</Text>
          </Pressable>
        ) : (
          <View style={[ui.card, styles.reveal, { borderColor: info.color }]}>
            <Text style={{ color: info.color, fontSize: 40, fontWeight: '900', letterSpacing: 2 }}>{info.name}</Text>
            <Text style={{ color: C.text, fontSize: 16, textAlign: 'center' }}>{info.goal}</Text>
            {me.role === 'infected' && allies.length > 0 && <Text style={{ color: C.red, fontSize: 15 }}>Fellow infected: {allies.join(', ')}</Text>}
            {me.role === 'doctor' && <Text style={{ color: C.green, fontSize: 15 }}>Heals: {me.healsLeft}</Text>}
          </View>
        )}
        {revealed && (
          <Pressable style={ui.primary} onPress={() => send('game:roleAck')}>
            <Text style={ui.primaryText}>GOT IT</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const z = radarText(zone);
  const debug = view.debugEnabled && view.hostId === view.youId;
  const vz = view.zone ?? null;
  const shrinkLeft = vz?.shrinksAt ? Math.max(0, Math.ceil((vz.shrinksAt - now) / 1000)) : null;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const toEdge = vz && myPos ? Math.max(0, Math.round(distanceM(myPos, vz.center) - vz.radiusM)) : null;
  const outside = graceLeft !== null && !eliminated;
  return (
    <MapWithRadar
      zone={eliminated ? 'NONE' : zone}
      tint={eliminated ? C.muted : info.color}
      baseSize={RADAR_SIZE}
      mapChildren={<>
        {vz && <ZoneOverlay zone={vz} flash={vz.warning && Math.floor(now / 500) % 2 === 0} />}
        <AllyPins allies={view.allies ?? []} />
        <PingDots pings={view.pings ?? []} pingAt={view.pingAt ?? null} now={now} />
      </>}>

      {/* red screen edge while outside the zone */}
      {outside && <View pointerEvents="none" style={styles.redEdge} />}

      {/* zone status under the timer */}
      {view.settings.zoneEnabled && view.zone !== undefined && !eliminated && (
        <View style={styles.zonePill} pointerEvents="none">
          <Text style={[styles.pillSub, vz?.warning && { color: C.red, fontWeight: '900' }]}>
            {!vz ? 'Zone: waiting for GPS…' : shrinkLeft !== null ? `Zone shrinks in ${mmss(shrinkLeft)}` : 'Final zone'}
          </Text>
        </View>
      )}
      {vz?.warning && shrinkLeft !== null && !outside && !eliminated && (
        <View style={styles.warnBanner} pointerEvents="none">
          <Text style={styles.warnText}>⚠ ZONE SHRINKING IN {mmss(shrinkLeft)}</Text>
        </View>
      )}
      {outside && (
        <View style={styles.outsideBox} pointerEvents="none">
          <Text style={styles.outsideTitle}>GET BACK IN THE ZONE!</Text>
          <Text style={styles.outsideCount}>{mmss(graceLeft!)}</Text>
          {toEdge !== null && <Text style={styles.outsideSub}>{toEdge} m to safe zone</Text>}
        </View>
      )}

      {/* top: timer + peek + leave */}
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.pill}>
          <Text style={styles.timer}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
          <Text style={styles.pillSub}>{view.players.filter((p) => p.status === 'active').length} alive</Text>
        </View>
        <Pressable onPressIn={() => setPeek(true)} onPressOut={() => setPeek(false)}
          style={[styles.pill, peek && { borderColor: info.color }]}>
          <Text style={[styles.pillSub, peek && { color: info.color, fontWeight: '900', fontSize: 14 }]}>
            {peek ? info.name + (me.role === 'doctor' ? ` · ${me.healsLeft}` : '') : 'Hold to peek role'}
          </Text>
        </Pressable>
      </View>
      <Pressable onPress={() => setConfirmLeave(true)} style={styles.leavePill} accessibilityRole="button">
        <Text style={styles.pillSub}>✕ Leave</Text>
      </Pressable>
      {peek && me.role === 'infected' && allies.length > 0 && (
        <Text style={[styles.status, { top: 120, fontSize: 14, color: C.red }]}>Fellow infected: {allies.join(', ')}</Text>
      )}

      {/* bottom: radar status + hold button for roles that can act */}
      <View style={styles.bottom} pointerEvents="box-none">
        <View pointerEvents="none" style={{ alignItems: 'center', gap: 2 }}>
          <Text style={[styles.statusText, { color: eliminated ? C.muted : zone === 'WARM' ? C.amber : zone === 'HOT' ? C.red : C.text }]}>
            {eliminated ? "ELIMINATED · watch until the round ends" : z.text}
          </Text>
          {!!bleStatus && !eliminated && <Text style={styles.ble}>{bleStatus}</Text>}
        </View>
        {toast !== '' && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}
        {debug && showDebug && (
          <View style={styles.debugBox}>
            <Small label="Bots roam" onPress={() => send('debug:botRoam', { on: true })} />
            <Small label="End in 5 s" onPress={() => send('debug:skip')} />
            {view.radar.map((r) => (
              <Small key={r.bleId} label={`#${r.bleId} → HOT`} onPress={() => send('debug:setProx', { targetBleId: r.bleId, zone: 'HOT' })} />
            ))}
          </View>
        )}
        {debug && (
          <Pressable onPress={() => setShowDebug(!showDebug)} style={styles.debugToggle}>
            <Text style={styles.pillSub}>{showDebug ? 'hide debug' : 'debug'}</Text>
          </Pressable>
        )}
        {canAct && holdMounted && (
          <Animated.View style={{ opacity: holdAnim, transform: [{ translateY: holdAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
          <Pressable
            onPressIn={async () => {
              holding.current = true;
              setPressing(true);
              // Everyone we hear nearby, closest first. If we hear nobody but only one player is left,
              // still try them: the server also counts THEIR phone hearing us, and has the final say.
              const near = targets.filter((t) => rank(t.zone) > 0);
              const tries = near.length ? near : targets.length === 1 ? targets : [];
              if (!tries.length) return onError('Nobody is close enough. Get right next to someone.');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
              let err: string | null = null;
              for (const t of tries) {
                if (!holding.current) return;
                err = await emitAck('action:start', { targetBleId: t.bleId });
                if (!err) return;
              }
              if (err && holding.current) onError(err);
            }}
            onPressOut={() => { holding.current = false; setPressing(false); send('action:cancel'); setAction(null); }}
            style={({ pressed }) => [styles.hold, pressed && { backgroundColor: me.role === 'doctor' ? '#2a8f62' : C.red }]}>
            <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: me.role === 'doctor' ? C.green : '#ff6b6b' }]} />
            <Text style={styles.holdText}>HOLD TO {verb}</Text>
          </Pressable>
          </Animated.View>
        )}
        {me.role === 'doctor' && me.healsLeft === 0 && !eliminated && <Text style={styles.ble}>No heals left. Survive!</Text>}
      </View>

      {confirmLeave && (
        <View style={styles.modalBack}>
          <View style={styles.modal}>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>Leave the game?</Text>
            <Text style={{ color: C.muted, fontSize: 15, textAlign: 'center' }}>You'll be out of this round.</Text>
            <Pressable style={ui.primary} onPress={() => { setConfirmLeave(false); leaveGame(); }}>
              <Text style={ui.primaryText}>LEAVE</Text>
            </Pressable>
            <Pressable style={ui.secondary} onPress={() => setConfirmLeave(false)}>
              <Text style={ui.secondaryText}>Stay</Text>
            </Pressable>
          </View>
        </View>
      )}
    </MapWithRadar>
  );
}

/** Metres between two GPS points (haversine). */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function Ended({ view }: { view: RoomView }) {
  const r = view.result;
  const isHost = view.hostId === view.youId;
  if (!r) return <Text style={ui.muted}>Round over…</Text>;
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: r.winner === 'infected' ? C.red : C.green, fontSize: 38, fontWeight: '900', textAlign: 'center' }}>
        {r.winner === 'infected' ? 'INFECTED WIN' : 'SURVIVORS WIN'}
      </Text>
      <Text style={[ui.muted, { textAlign: 'center' }]}>{r.reason}</Text>
      <Text style={[ui.muted, { textAlign: 'center' }]}>
        {r.infectedTotal} infected · {r.curedTotal} cured · {r.eliminatedTotal} eliminated
      </Text>
      <View style={ui.card}>
        {r.standings.map((s, i) => (
          <View key={s.name + i} style={styles.standing}>
            <Text style={{ color: C.text, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ color: ROLE_INFO[s.finalRole].color, fontSize: 13, fontWeight: '800' }}>
              {s.startRole === s.finalRole ? ROLE_INFO[s.finalRole].name : `${ROLE_INFO[s.startRole].name} → ${ROLE_INFO[s.finalRole].name}`}
              {s.status === 'eliminated' ? ' · OUT' : ''}
            </Text>
          </View>
        ))}
      </View>
      {isHost ? (
        <Pressable style={ui.primary} onPress={() => send('game:playAgain')}>
          <Text style={ui.primaryText}>PLAY AGAIN</Text>
        </Pressable>
      ) : (
        <Text style={[ui.muted, { textAlign: 'center' }]}>Waiting for the host to start another round.</Text>
      )}
      <Pressable style={ui.secondary} onPress={leaveGame}>
        <Text style={ui.secondaryText}>Leave to home</Text>
      </Pressable>
    </View>
  );
}

function Small({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: C.line, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
      <Text style={{ color: C.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  zonePill: { position: 'absolute' as const, top: 150, left: 16, backgroundColor: 'rgba(10,13,22,0.82)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingVertical: 6, paddingHorizontal: 10 },
  warnBanner: { position: 'absolute' as const, top: 200, left: 40, right: 40, backgroundColor: 'rgba(230,57,70,0.92)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' as const },
  warnText: { color: '#fff', fontSize: 16, fontWeight: '900' as const, letterSpacing: 1 },
  redEdge: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderWidth: 10, borderColor: 'rgba(230,57,70,0.75)' },
  outsideBox: { position: 'absolute' as const, top: 200, left: 24, right: 24, backgroundColor: 'rgba(40,6,10,0.92)', borderRadius: 16, borderWidth: 2, borderColor: C.red, paddingVertical: 14, alignItems: 'center' as const, gap: 2 },
  outsideTitle: { color: '#fff', fontSize: 20, fontWeight: '900' as const, letterSpacing: 1 },
  outsideCount: { color: C.red, fontSize: 44, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  outsideSub: { color: C.text, fontSize: 14 },
  leavePill: { position: 'absolute' as const, top: 106, right: 16, backgroundColor: 'rgba(10,13,22,0.82)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(230,57,70,0.35)', paddingVertical: 6, paddingHorizontal: 12 },
  modalBack: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  modal: { width: '100%' as const, maxWidth: 360, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.red, padding: 20, gap: 12 },
  topRow: { position: 'absolute' as const, top: 58, left: 16, right: 16, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const },
  pill: { backgroundColor: 'rgba(10,13,22,0.82)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(230,57,70,0.35)', paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' as const },
  timer: { color: C.text, fontSize: 24, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  pillSub: { color: C.muted, fontSize: 13, fontWeight: '600' as const },
  center: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' as const, justifyContent: 'center' as const },
  statusWrap: { position: 'absolute' as const, left: 24, right: 24, top: '50%' as const, marginTop: RADAR_SIZE / 2 + 18, alignItems: 'center' as const, gap: 4 },
  statusText: { fontSize: 24, fontWeight: '900' as const, textAlign: 'center' as const, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 8 },
  status: { position: 'absolute' as const, left: 24, right: 24, textAlign: 'center' as const, fontWeight: '700' as const },
  ble: { color: C.muted, fontSize: 12, textAlign: 'center' as const },
  bottom: { position: 'absolute' as const, left: 16, right: 16, bottom: 36, gap: 10 },
  toast: { backgroundColor: 'rgba(10,13,22,0.92)', borderRadius: 12, borderWidth: 1, borderColor: C.red, padding: 12 },
  toastText: { color: C.text, fontSize: 15, textAlign: 'center' as const },
  debugToggle: { alignSelf: 'flex-start' as const, backgroundColor: 'rgba(10,13,22,0.8)', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10 },
  debugBox: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, backgroundColor: 'rgba(10,13,22,0.9)', borderRadius: 12, padding: 10 },
  reveal: { minHeight: 260, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14, borderWidth: 2, borderColor: C.line },
  topBar: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  radar: { minHeight: 220, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 18, borderWidth: 2, borderColor: C.line },
  dot: { width: 26, height: 26, borderRadius: 13 },
  hold: { height: 110, borderRadius: 20, backgroundColor: C.redDeep, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  fill: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, opacity: 0.6 },
  holdText: { color: '#fff', fontSize: 26, fontWeight: '900' as const, letterSpacing: 2 },
  standing: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 6, gap: 10 },
};
