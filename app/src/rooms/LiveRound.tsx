import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ActionProgress, MyState, RadarEntry, Role, RoomView, Settings, Zone } from '../../../shared/protocol';
import { fieldStyles as f, MenuItem, MenuPaper, party, PrintedHoldButton, TrackStripe } from '../ui/Menu';

const roles = {
  innocent: { name: 'Innocent', color: party.sky, goal: 'Avoid bites until the clock runs out.', prompt: 'Keep your distance.' },
  doctor: { name: 'Doctor', color: party.lime, goal: 'Heal infected players. If they bite you, the infected win.', prompt: 'Get close to heal.' },
  infected: { name: 'Infected', color: party.orange, goal: 'Bite survivors. Infect everyone or catch the doctor to win.', prompt: 'Get close to bite.' },
};

const bands = { HOT: { rank: 3, text: 'Very close' }, WARM: { rank: 2, text: 'Nearby' }, COLD: { rank: 1, text: 'Farther away' } };

function clock(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
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

function RolePeek({ role, allies }: { role: Role; allies: string[] }) {
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') setPeeking(false); });
    return () => sub.remove();
  }, []);
  return <Pressable accessibilityRole="button" accessibilityLabel="Hold to peek at your role"
    onPressIn={() => setPeeking(true)} onPressOut={() => setPeeking(false)} style={s.peek}>
    <Text style={f.label}>{peeking ? [roles[role].name, ...allies].join(' · ') : 'Hold to peek at role'}</Text>
  </Pressable>;
}

type Actions = {
  onStartAction: (id: number) => Promise<void>;
  onCancelAction: () => void;
  actionProgress: ActionProgress | null;
};

function HoldAction({ targetId, targetName, role, durationMs, clockOffset, onStartAction, onCancelAction, actionProgress }: Actions & {
  targetId?: number; targetName?: string; role: 'doctor' | 'infected'; durationMs: number; clockOffset: number;
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
    if (holding.current) cancelRef.current();
    holding.current = false;
    setPressed(false);
  }
  const verb = role === 'doctor' ? 'heal' : 'bite';
  const active = pressed && (pending || !!progress);
  const label = active ? (role === 'doctor' ? 'Healing' : 'Biting') + (targetName ? ' ' + targetName : '…') : 'Hold to ' + verb;
  return <>
    {failure !== '' && <Text accessibilityRole="alert" style={f.error}>{failure}</Text>}
    <PrintedHoldButton label={label} detail={pressed && progress ? Math.round(fraction * 100) + '%' : durationMs / 1000 + 's'}
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
  urgentZone?: boolean;
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
    ? <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
        onPress={onSelect} style={[s.contactRow, selected && s.selected]}>{content}</Pressable>
    : <View accessible accessibilityLabel={label} style={s.contactRow}>{content}</View>;
}

export function RoundScreen({ me, name, radar, settings, endsAt, clockOffset, onRoleAck, actionProgress, onStartAction,
  onCancelAction, feedback, bluetoothStatus, zone, urgentZone }: RoundProps) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  const [choice, setChoice] = useState<number | null>(null);
  const [signalIds] = useState(() => radar.map(entry => entry.bleId).sort((a, b) => a - b));
  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffset);
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [clockOffset]);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const role = me.role;
  if (me.status === 'eliminated') return <View style={[f.page, f.content]}>
    <Text style={f.title}>You’re out</Text><Text style={f.body}>The round is still going. Stay here for the results.</Text>
    <Text style={f.metric}>{clock(left)}</Text>
  </View>;
  if (!role) return <View style={[f.page, f.content]}><Text style={f.body}>Waiting for your role…</Text></View>;
  const allies = role === 'infected' ? radar.flatMap(entry => entry.ally && entry.name ? [entry.name] : []) : [];
  if (!me.roleAcked) return <RoleCard key={role} role={role} name={name} charges={me.healsLeft} allies={allies} onAck={onRoleAck} />;

  const contacts = radar.filter((r): r is RadarEntry & { zone: Zone } => r.zone !== undefined)
    .sort((a, b) => bands[b.zone].rank - bands[a.zone].rank || a.bleId - b.bleId);
  const canAct = role === 'infected' || (role === 'doctor' && me.healsLeft > 0);
  const targets = canAct ? contacts.filter(r => r.zone === 'HOT' && !r.ally) : [];
  const target = targets.find(r => r.bleId === choice) ?? targets[0];
  const nameOf = (entry: RadarEntry) => entry.ally && entry.name ? entry.name :
    'Signal ' + (signalIds.includes(entry.bleId) ? signalIds.indexOf(entry.bleId) + 1 : entry.bleId);
  const immunity = Math.max(0, Math.ceil((me.immuneUntil - now) / 1000));
  const headline = targets.length > 1 ? 'Choose a target.' : target ? 'A player is in reach.' :
    role === 'doctor' && !canAct ? 'Stay out of reach.' : roles[role].prompt;
  const instruction = role === 'innocent' ? 'The stronger the signal, the closer the player.' :
    !canAct ? 'Your heals are used up. Avoid bites until time runs out.' :
    targets.length > 1 ? 'Tap a very close signal, then hold the button until it fills.' :
    target ? 'Hold the button until it fills. Release early to cancel.' : 'Look for a very close signal to get within reach.';

  return <View style={f.page}>
    <ScrollView style={f.page} contentContainerStyle={f.content}>
      {urgentZone && zone}
      <View style={s.scoreboard}>
        <View style={s.metric}><Text style={f.kicker}>TIME LEFT</Text><Text style={f.metric}>{clock(left)}</Text></View>
        {role === 'doctor' && <View style={[s.metric, s.charges]}>
          <Text style={f.kicker}>HEALS LEFT</Text><Text accessibilityLabel={me.healsLeft + ' healing charges left'} style={f.metric}>{me.healsLeft}</Text>
        </View>}
      </View>
      <View style={s.copy}><Text accessibilityRole="header" style={f.title}>{headline}</Text>
        <Text style={f.body}>{instruction}</Text></View>
      {immunity > 0 && <Text style={f.label}>Protected from bites for {immunity}s</Text>}
      <View style={s.contacts}>
        <View style={s.radarHead}><Text accessibilityRole="header" style={f.heading}>Nearby players</Text><Text style={f.label}>{contacts.length}</Text></View>
        {contacts.map(r => <NearbyRow key={r.bleId} name={nameOf(r)} band={r.zone} ally={r.ally}
          selected={target?.bleId === r.bleId} onSelect={canAct && r.zone === 'HOT' && !r.ally ? () => setChoice(r.bleId) : undefined} />)}
        {contacts.length === 0 && <Text style={[f.muted, s.empty]}>{bluetoothStatus || 'No signals yet. Move closer to another player with PULSE open.'}</Text>}
      </View>
      {contacts.length > 0 && !!bluetoothStatus && <Text style={f.muted}>{bluetoothStatus}</Text>}
      {!urgentZone && zone}
      <RolePeek role={role} allies={allies} />
      {!canAct && !!feedback && <Text accessibilityLiveRegion="polite" style={f.body}>{feedback}</Text>}
    </ScrollView>
    {canAct && <View style={[s.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.dockInterior}>
        {!!feedback && <Text accessibilityLiveRegion="polite" style={f.body}>{feedback}</Text>}
        {target && <Text style={f.label}>Target · {nameOf(target)}</Text>}
        <HoldAction key={role + '-' + (target?.bleId ?? 'none')} targetId={target?.bleId} targetName={target && nameOf(target)}
          role={role} durationMs={role === 'doctor' ? settings.healHoldMs : settings.biteHoldMs} clockOffset={clockOffset}
          onStartAction={onStartAction} onCancelAction={onCancelAction} actionProgress={actionProgress} />
      </View>
    </View>}
  </View>;
}

export function LiveRound({ room, ...actions }: Actions & {
  room: RoomView; radar: RadarEntry[]; onRoleAck: () => void; feedback: string; bluetoothStatus?: string; zone?: ReactNode;
}) {
  const [clockOffset] = useState(() => room.serverNow - Date.now());
  if (!room.me || room.endsAt === null) return null;
  return <RoundScreen key={room.me.bleId} me={room.me} name={room.players.find(p => p.id === room.youId)?.name ?? ''}
    urgentZone={room.me.graceEndsAt != null || room.zone?.warning} settings={room.settings} endsAt={room.endsAt}
    clockOffset={clockOffset} {...actions} />;
}

const s = StyleSheet.create({
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: party.ink, borderRadius: 8, overflow: 'hidden', backgroundColor: party.sky },
  peek: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  metric: { flex: 1, minWidth: 110, paddingVertical: 10, paddingHorizontal: 14 },
  charges: { backgroundColor: party.lime },
  copy: { gap: 4 },
  contacts: { backgroundColor: party.panel, borderWidth: 1, borderColor: party.ink, borderRadius: 8, overflow: 'hidden' },
  radarHead: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  contactRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingVertical: 8, paddingHorizontal: 12, flexWrap: 'wrap' },
  contact: { flex: 1, minWidth: 65 },
  selected: { backgroundColor: party.sky },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 }, bar: { width: 3, borderRadius: 1 },
  radio: { width: 18, height: 18, borderWidth: 2, borderRadius: 9, borderColor: party.ink, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: party.panel }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: party.ink },
  empty: { paddingHorizontal: 14, paddingBottom: 14 },
  dock: { borderTopWidth: 1, borderColor: party.ink, backgroundColor: party.paper, paddingTop: 10, paddingHorizontal: 16 },
  dockInterior: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 5 },
});
