import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from 'expo-router/react-navigation';
import type { ActionProgress, MyState, RadarEntry, Role, RoomView, Settings, Zone } from '../../../shared/protocol';
import { PING_INTERVAL_MS } from '../../../shared/protocol';
import { FieldChoice, fieldStyles as f, MenuItem, MenuPaper, party, PrintedHoldButton, TrackStripe } from '../ui/Menu';
import { fieldHeaderOptions, HeaderAction } from '../ui/HeaderAction';

const roles = {
  innocent: { name: 'Innocent', color: party.sky, goal: 'Avoid bites until the clock runs out.' },
  doctor: { name: 'Doctor', color: party.lime, goal: 'Heal infected players. If they bite you, the infected win.' },
  infected: { name: 'Infected', color: party.orange, goal: 'Bite survivors. Infect everyone or catch the doctor to win.' },
};

const bands = { HOT: { rank: 3, text: 'Very close' }, WARM: { rank: 2, text: 'Nearby' }, COLD: { rank: 1, text: 'Farther away' } };

function clock(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function timeLeft(deadline: number, now: number) {
  return clock(Math.max(0, Math.ceil((deadline - now) / 1000)));
}

function ClockCell({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return <View accessible accessibilityLabel={label + ', ' + value} style={[s.clockCell, primary && s.mainClock]}>
    <Text style={s.clockLabel}>{label}</Text>
    <Text style={[f.metric, s.clockValue]}>{value}</Text>
  </View>;
}

function RoleCard({ role, name, charges, allies, onAck }: { role: Role; name: string; charges: number; allies: string[]; onAck: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') setOpen(false); });
    return () => sub.remove();
  }, []);
  const info = roles[role];
  return <ScrollView style={f.page} contentContainerStyle={f.content}>
    <Text style={f.kicker}>{name}</Text>
    <Text accessibilityRole="header" style={f.title}>{open ? info.name : 'Your secret role'}</Text>
    <TrackStripe />
    <View style={[f.panel, { backgroundColor: open ? info.color : party.panel }]}>
      <MenuPaper />
      <Text style={f.body}>{open ? info.goal : 'Turn the screen toward yourself before you peek.'}</Text>
      {open && role === 'doctor' && <Text style={f.heading}>{charges} healing {charges === 1 ? 'charge' : 'charges'}</Text>}
      {open && allies.length > 0 && <Text style={f.label}>Fellow infected · {allies.join(', ')}</Text>}
    </View>
    <MenuItem label={open ? 'Hide role and play' : 'Reveal my role'} onPress={open ? onAck : () => setOpen(true)} />
  </ScrollView>;
}

function RolePeek({ role, allies, charges }: { role: Role; allies: string[]; charges: number }) {
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') setPeeking(false); });
    return () => sub.remove();
  }, []);
  const hideRole = () => setPeeking(false);
  return <>
    <FieldChoice label="View role" accessibilityLabel="View your secret role" onPress={() => setPeeking(true)} />
    {peeking && <Modal transparent animationType="fade" onRequestClose={hideRole}>
      <View style={s.roleBackdrop}>
        <ScrollView style={s.roleDialog} contentContainerStyle={[f.panel, { backgroundColor: roles[role].color }]}>
          <Text accessibilityRole="header" style={f.heading}>{roles[role].name}</Text>
          <Text style={f.body}>{roles[role].goal}</Text>
          {role === 'doctor' && <Text style={f.label}>{charges} healing {charges === 1 ? 'charge' : 'charges'}</Text>}
          {allies.length > 0 && <Text style={f.label}>Fellow infected · {allies.join(', ')}</Text>}
          <FieldChoice label="Hide role" onPress={hideRole} />
        </ScrollView>
      </View>
    </Modal>}
  </>;
}

type Actions = {
  onStartAction: (id: number) => Promise<void>;
  onCancelAction: () => void;
  actionProgress: ActionProgress | null;
};

function HoldAction({ targetId, targetName, role, healsLeft, durationMs, clockOffset, onStartAction, onCancelAction, actionProgress }: Actions & {
  targetId?: number; targetName?: string; role: 'doctor' | 'infected'; healsLeft?: number; durationMs: number; clockOffset: number;
}) {
  const [pressed, setPressed] = useState(false);
  const [pending, setPending] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [failure, setFailure] = useState('');
  const gesture = useRef(0);
  const holding = useRef(false);
  const cancelRef = useRef(onCancelAction);
  useEffect(() => { cancelRef.current = onCancelAction; }, [onCancelAction]);
  useEffect(() => {
    function cancel() {
      if (holding.current) cancelRef.current();
      holding.current = false;
      gesture.current++;
    }
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { cancel(); setPressed(false); }
    });
    return () => { sub.remove(); cancel(); };
  }, []);

  const progress = actionProgress?.targetBleId === targetId ? actionProgress : null;
  useEffect(() => {
    if (!pressed || !progress) return;
    const tick = () => setFraction(Math.max(0, Math.min(1, (Date.now() + clockOffset - progress.startedAt) / progress.durationMs)));
    const timer = setInterval(tick, 40);
    return () => clearInterval(timer);
  }, [pressed, progress, clockOffset]);

  function begin() {
    if (targetId === undefined || holding.current) return;
    const sequence = ++gesture.current;
    setFailure('');
    setFraction(0);
    holding.current = true;
    setPressed(true);
    setPending(true);
    onStartAction(targetId).then(() => {
      if (gesture.current === sequence) setPending(false);
    }, (error: unknown) => {
      if (gesture.current !== sequence) return;
      holding.current = false;
      setPressed(false);
      setFailure(error instanceof Error ? error.message : 'Could not start. Try again.');
    });
  }
  function release() {
    gesture.current++;
    if (holding.current) cancelRef.current();
    holding.current = false;
    setPressed(false);
  }
  const verb = role === 'doctor' ? 'heal' : 'bite';
  const active = pressed && (pending || !!progress);
  const label = (active ? 'Keep holding to ' : 'Press and hold to ') + verb;
  const seconds = durationMs / 1000;
  const duration = seconds + (seconds === 1 ? ' second' : ' seconds');
  const detail = healsLeft === 0 ? 'No healing charges left' : targetName
    ? targetName + ' · ' + (active ? 'Release to cancel' : duration) : 'Move closer to a player';
  return <>
    {failure !== '' && <Text accessibilityRole="alert" style={f.error}>{failure}</Text>}
    <PrintedHoldButton label={label} detail={detail} accent={roles[role].color}
      badge={healsLeft == null ? undefined : healsLeft + (healsLeft === 1 ? ' heal left' : ' heals left')}
      progress={active ? fraction : 0} disabled={targetId === undefined} onPressIn={begin} onPressOut={release} />
  </>;
}

interface RoundProps extends Actions {
  me: MyState;
  name: string;
  radar: RadarEntry[];
  settings: Settings;
  endsAt: number;
  clockOffset: number;
  onRoleAck: () => void;
  feedback: string;
  bluetoothStatus?: string;
  zone?: ReactNode;
  timing?: Pick<RoomView, 'zone' | 'pingAt' | 'serverNow'>;
}

function NearbyRow({ name, band, ally, selected, onSelect }: {
  name: string; band: Zone; ally: boolean; selected: boolean; onSelect?: () => void;
}) {
  const info = bands[band];
  const label = [name, ally ? 'Teammate' : '', info.text].filter(Boolean).join(', ');
  const content = <>
    <View aria-hidden style={s.signal}>{[1, 2, 3].map(level =>
      <View key={level} style={[s.bar, { height: 4 + level * 4, backgroundColor: level <= info.rank ? party.ink : party.line }]} />)}</View>
    <View style={s.contact}><Text style={f.label}>{name}</Text>{ally && <Text style={f.muted}>Teammate</Text>}</View>
    <Text style={f.muted}>{info.text}</Text>
    {onSelect && <View aria-hidden style={[s.radio, selected && s.checked]}>{selected && <View style={s.dot} />}</View>}
  </>;
  return onSelect
    ? <Pressable accessibilityRole="radio" accessibilityLabel={label} aria-checked={selected} accessibilityState={{ checked: selected }}
        onPress={onSelect} style={[s.contactRow, selected && s.selected]}>{content}</Pressable>
    : <View accessible accessibilityLabel={label} style={s.contactRow}>{content}</View>;
}

export function RoundScreen({ me, name, radar, settings, endsAt, clockOffset, onRoleAck, actionProgress, onStartAction,
  onCancelAction, feedback, bluetoothStatus, zone, timing }: RoundProps) {
  const insets = useSafeAreaInsets();
  const [localNow, setLocalNow] = useState(Date.now);
  const now = Math.max(localNow + clockOffset, timing?.serverNow ?? 0);
  const [choice, setChoice] = useState<number | null>(null);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [signalIds] = useState(() => radar.map(entry => entry.bleId).sort((a, b) => a - b));
  useEffect(() => {
    const timer = setInterval(() => setLocalNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const remaining = timeLeft(endsAt, now);
  const role = me.role;
  if (me.status === 'eliminated') return <View style={[f.page, f.content]}>
    <Text style={f.title}>You’re out</Text><Text style={f.body}>The round is still going. Stay here for the results.</Text>
    <Text style={f.metric}>{remaining}</Text>
  </View>;
  if (!role) return <View style={[f.page, f.content]}><Text style={f.body}>Waiting for your role…</Text></View>;
  const allies = role === 'infected' ? radar.flatMap(entry => entry.ally && entry.name ? [entry.name] : []) : [];
  if (!me.roleAcked) return <RoleCard key={role} role={role} name={name} charges={me.healsLeft} allies={allies} onAck={onRoleAck} />;
  const roundStartedAt = endsAt - settings.durationSec * 1000;
  const nextPing = (timing?.pingAt ?? roundStartedAt) + PING_INTERVAL_MS;
  const safeZone = timing?.zone;
  const shrinkTime = !settings.zoneEnabled ? 'Off' : !safeZone ? 'GPS…'
    : safeZone.shrinksAt == null ? 'Final' : timeLeft(safeZone.shrinksAt, now);

  const contacts = radar.filter((r): r is RadarEntry & { zone: Zone } => r.zone !== undefined)
    .sort((a, b) => bands[b.zone].rank - bands[a.zone].rank || a.bleId - b.bleId);
  const canAct = role === 'infected' || (role === 'doctor' && me.healsLeft > 0);
  const targets = canAct ? contacts.filter(r => r.zone === 'HOT' && !r.ally) : [];
  const target = targets.find(r => r.bleId === choice) ?? targets[0];
  const nameOf = (entry: RadarEntry) => entry.ally && entry.name ? entry.name :
    'Signal ' + (signalIds.includes(entry.bleId) ? signalIds.indexOf(entry.bleId) + 1 : entry.bleId);
  const immunity = Math.max(0, Math.ceil((me.immuneUntil - now) / 1000));

  return <View style={f.page}>
    <View style={s.scoreboard}>
      <ClockCell primary label="Round left" value={remaining} />
      {timing && <>
        <ClockCell label={role === 'infected' ? 'Ally map' : 'Next ping'} value={role === 'infected' ? 'Live' : timeLeft(nextPing, now)} />
        <ClockCell label="Zone shrinks" value={shrinkTime} />
      </>}
    </View>
    {zone}
    <View style={[s.dock, { paddingBottom: insets.bottom }]}>
      <View style={s.dockInterior}>
        <View style={s.toolbar}>
          <FieldChoice label={'Nearby players (' + contacts.length + ')'} onPress={() => setNearbyOpen(true)} />
          <RolePeek role={role} allies={allies} charges={me.healsLeft} />
        </View>
        {immunity > 0 && <Text style={f.label}>Protected from bites for {immunity}s</Text>}
        {!!feedback && <Text accessibilityLiveRegion="polite" style={f.body}>{feedback}</Text>}
        {role !== 'innocent' && <HoldAction key={role + '-' + (target?.bleId ?? 'none')} targetId={target?.bleId} targetName={target && nameOf(target)}
          healsLeft={role === 'doctor' ? me.healsLeft : undefined} role={role} durationMs={role === 'doctor' ? settings.healHoldMs : settings.biteHoldMs} clockOffset={clockOffset}
          onStartAction={onStartAction} onCancelAction={onCancelAction} actionProgress={actionProgress} />}
      </View>
    </View>
    {nearbyOpen && <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNearbyOpen(false)}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={fieldHeaderOptions.headerStyle}>
          <Header {...fieldHeaderOptions} modal headerStatusBarHeight={0} title="Nearby players"
            headerLeft={() => <HeaderAction label="Close" accessibilityLabel="Close nearby players" onPress={() => setNearbyOpen(false)} />} />
        </SafeAreaView>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={f.page}>
          <ScrollView contentContainerStyle={f.content}>
            {targets.length > 1 && <Text style={f.body}>Choose a very close signal to target.</Text>}
            {contacts.length > 0 && <View style={s.contacts}>
              {contacts.map(r => <NearbyRow key={r.bleId} name={nameOf(r)} band={r.zone} ally={r.ally}
                selected={target?.bleId === r.bleId} onSelect={canAct && r.zone === 'HOT' && !r.ally
                  ? () => { setChoice(r.bleId); setNearbyOpen(false); } : undefined} />)}
            </View>}
            {bluetoothStatus ? <Text style={f.muted}>{bluetoothStatus}</Text> : contacts.length === 0 &&
              <Text style={f.body}>No signals yet. Move closer to another player with PULSE open.</Text>}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>}
  </View>;
}

export function LiveRound({ room, ...actions }: Actions & {
  room: RoomView; clockOffset: number; radar: RadarEntry[]; onRoleAck: () => void; feedback: string; bluetoothStatus?: string; zone?: ReactNode;
}) {
  if (!room.me || room.endsAt === null) return null;
  return <RoundScreen key={room.me.bleId} me={room.me} name={room.players.find(p => p.id === room.youId)?.name ?? ''}
    timing={room} settings={room.settings} endsAt={room.endsAt} {...actions} />;
}

const s = StyleSheet.create({
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: party.ink, borderBottomWidth: 1, borderColor: party.ink },
  clockCell: { flexGrow: 1, flexBasis: 80, backgroundColor: party.panel, paddingHorizontal: 10, paddingVertical: 4 },
  mainClock: { backgroundColor: party.sky },
  clockLabel: { color: party.ink, fontSize: 13, fontWeight: '700' },
  clockValue: { fontSize: 26 },
  roleBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  roleDialog: { flexGrow: 0, width: '100%', maxWidth: 360, maxHeight: '90%' },
  contacts: { backgroundColor: party.panel, borderWidth: 1, borderColor: party.ink, borderRadius: 8, overflow: 'hidden' },
  contactRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingVertical: 8, paddingHorizontal: 12, flexWrap: 'wrap' },
  contact: { flex: 1, minWidth: 65 },
  selected: { backgroundColor: party.sky },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 }, bar: { width: 3, borderRadius: 1 },
  radio: { width: 18, height: 18, borderWidth: 2, borderRadius: 9, borderColor: party.ink, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: party.panel }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: party.ink },
  dock: { borderTopWidth: 1, borderColor: party.ink, backgroundColor: party.paper, paddingTop: 5, paddingHorizontal: 12 },
  dockInterior: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 5 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
});
