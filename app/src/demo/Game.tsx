import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Role, Team, Zone } from '../../../shared/protocol';

export interface DemoResult {
  name: string;
  role: Role;
  winner: Team;
  bites: number;
  heals: number;
  elapsedSec: number;
  reason: string;
  standings: { name: string; role: Role }[];
}

const roles = {
  innocent: { title: 'Innocent', color: '#8CCFFF', objective: 'Stay clear of infected players and survive until time runs out.' },
  doctor: { title: 'Doctor', color: '#BCFA74', objective: 'Find and heal infected players. You have two charges. If you are bitten, the infected win.' },
  infected: { title: 'Infected', color: '#FFA58F', objective: 'Find nearby survivors and hold Bite to infect them. Infect the doctor to end the round.' },
} satisfies Record<Role, { title: string; color: string; objective: string }>;

const contacts = [
  { id: 1, label: 'Signal A', initial: 'HOT' },
  { id: 2, label: 'Signal B', initial: 'WARM' },
] as const;
const bands: Zone[] = ['COLD', 'WARM', 'HOT'];

type GameProps = { name: string; onZone: (snapshot: DemoResult) => void; onEnd: (result: DemoResult) => void };

export default function Game({ name, onZone, onEnd }: GameProps) {
  const [role, setRole] = useState<Role>('innocent');
  const [stage, setStage] = useState<'sealed' | 'revealed' | 'playing'>('sealed');
  const [options, setOptions] = useState(false);
  const [selected, setSelected] = useState<number>(1);
  const [distances, setDistances] = useState<Zone[]>(contacts.map(contact => contact.initial));
  const [completed, setCompleted] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [start, setStart] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const roleInfo = roles[role];
  const tint = roleInfo.color;
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const remaining = Math.max(0, 15 * 60 - elapsed);
  const band = distances[selected - 1];
  const action = role === 'doctor' ? 'Heal' : 'Bite';
  const canAct = role !== 'innocent' && band === 'HOT' && !completed.includes(selected);

  function cancelHold(announce = false) {
    if (!holdTimer.current) return;
    clearInterval(holdTimer.current);
    holdTimer.current = null;
    setProgress(0);
    if (announce) setFeedback('Hold cancelled.');
  }

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        cancelHold();
        setStage(previous => previous === 'revealed' ? 'sealed' : previous);
      }
    });
    return () => {
      clearInterval(clock);
      if (holdTimer.current) clearInterval(holdTimer.current);
      sub.remove();
    };
  }, []);

  function result(winner: Team, reason: string, affected = completed): DemoResult {
    const standings: DemoResult['standings'] = role === 'infected'
      ? [{ name: 'Mara', role: 'infected' }, { name: 'Jules', role: affected.includes(1) ? 'infected' : 'innocent' },
        { name: 'Remy', role: affected.includes(2) ? 'infected' : 'doctor' }]
      : [{ name: 'Mara', role: affected.includes(1) ? 'innocent' : 'infected' },
        { name: 'Jules', role: role === 'doctor' && !affected.includes(2) ? 'infected' : 'innocent' },
        { name: 'Remy', role: role === 'doctor' ? 'innocent' : 'doctor' }];
    return { name, role, winner, reason, standings, bites: role === 'infected' ? affected.length : 0,
      heals: role === 'doctor' ? affected.length : 0, elapsedSec: elapsed };
  }

  useEffect(() => {
    if (stage === 'playing' && remaining === 0) onEnd(result('survivors', 'Time expired with survivors still active.'));
  });

  function chooseRole(next: Role) {
    cancelHold();
    setCompleted([]);
    setDistances(contacts.map(contact => contact.initial));
    setSelected(1);
    setRole(next);
    setStage('sealed');
    setOptions(false);
    setFeedback('');
    setStart(now);
  }

  function beginHold() {
    if (!canAct || holdTimer.current) return;
    setFeedback('');
    const started = Date.now();
    setProgress(0.01);
    holdTimer.current = setInterval(() => {
      const fraction = Math.min(1, (Date.now() - started) / 2000);
      if (fraction < 1) return setProgress(fraction);
      cancelHold();
      const total = completed.length + 1;
      setCompleted(previous => [...previous, selected]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (role === 'infected' && selected === 2) onEnd(result('infected', 'The doctor was infected.', [...completed, selected]));
      else setFeedback(role === 'doctor' ? (total === 1 ? 'Player cured. One healing charge left.' : 'Player cured. No healing charges left.') : 'Player infected.');
    }, 50);
  }

  const rolePicker = <View style={s.tools}>
    <Control label={options ? 'Hide demo settings' : 'Demo settings'} onPress={() => setOptions(!options)} />
    {options && <View style={s.group}><Text style={s.muted}>Restart this demo as</Text><View style={s.wrap}>
      {(Object.keys(roles) as Role[]).map(value => <Control key={value} label={roles[value].title} onPress={() => chooseRole(value)} />)}
    </View></View>}
  </View>;

  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {stage !== 'playing' ? <>
      <Text accessibilityRole="header" style={s.title}>{stage === 'sealed' ? 'Private assignment' : roleInfo.title}</Text>
      <View style={[s.card, { borderLeftColor: stage === 'sealed' ? '#BCFA74' : tint, borderLeftWidth: 4 }]}>
        <Text style={s.kicker}>{name}</Text>
        <Text style={s.body}>{stage === 'sealed' ? 'Check that only you can see this screen, then reveal your role.' : roleInfo.objective}</Text>
      </View>
      <Control primary label={stage === 'sealed' ? 'Reveal my role' : 'Hide role and enter game'} onPress={() => {
        setOptions(false); setStage(stage === 'sealed' ? 'revealed' : 'playing');
      }} />
      {rolePicker}
    </> : <>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>Radar</Text>
        <Text style={s.time}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text></View>
      <View style={s.card}>
        <View accessible accessibilityLabel={'Selected signal is ' + band.toLowerCase()} style={s.scope}>
          {[100, 72, 44].map((size, index) => <View key={size} style={[s.ring, { width: `${size}%`, height: `${size}%`, borderColor: band === bands[index] ? tint : '#3D5150' }]} />)}
          <View style={[s.dot, { backgroundColor: tint }]} />
        </View>
        <Text style={[s.band, { color: tint }]}>{band}</Text>
        <Text style={s.caption}>{band === 'HOT' ? 'Very close' : band === 'WARM' ? 'Nearby' : 'Further away'}</Text>
      </View>
      <Text style={s.heading}>Nearby signals</Text>
      <View style={s.wrap}>{contacts.map(contact => <Control key={contact.id} selected={selected === contact.id}
        label={role === 'infected' && completed.includes(contact.id) ? 'Ally · Jules' : contact.label}
        onPress={() => { cancelHold(true); setSelected(contact.id); }} />)}
      </View>
      {role === 'infected' && <Text style={s.muted}>Ally · Mara · COLD</Text>}
      {role !== 'innocent' && <>
        {role === 'doctor' && <Text style={s.muted}>Healing charges · {2 - completed.length} / 2</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canAct }} disabled={!canAct}
          accessibilityLabel={'Hold to ' + action.toLowerCase()} accessibilityHint="Keep pressed for two seconds"
          onPressIn={beginHold} onPressOut={() => cancelHold(true)}
          style={[s.button, s.primary, !canAct && s.disabled]}>
          <Text style={s.primaryText}>{progress ? `${action} · ${Math.ceil(progress * 100)}%` : 'Hold to ' + action.toLowerCase()}</Text>
        </Pressable>
        {!canAct && <Text style={s.muted}>{completed.includes(selected) ? 'This interaction is complete.' : 'Move into HOT range to interact.'}</Text>}
      </>}
      {feedback !== '' && <Text accessibilityLiveRegion="polite" style={s.body}>{feedback}</Text>}
      <Control label="Open safe zone" onPress={() => { cancelHold(); onZone(result('survivors', 'Safe zone opened.')); }} />
      {rolePicker}
      {options && <View style={s.group}>
        <Text style={s.muted}>Selected signal proximity</Text>
        <View style={s.wrap}>{bands.map(value => <Control key={value} label={value} selected={band === value} onPress={() => {
          cancelHold(true); setDistances(previous => previous.map((old, index) => index === selected - 1 ? value : old));
          void Haptics.selectionAsync().catch(() => {});
        }} />)}</View>
      </View>}
      <Control label="Finish demo round" onPress={() => { cancelHold(); onEnd(result('survivors', 'The demo round ended with survivors still active.')); }} />
    </>}
  </ScrollView>;
}

function Control({ label, onPress, primary, selected }: { label: string; onPress: () => void; primary?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [s.button, primary && s.primary, selected && s.selected, pressed && s.pressed]}>
    <Text style={primary ? s.primaryText : s.buttonText}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101518' },
  content: { width: '100%', maxWidth: 580, alignSelf: 'center', padding: 24, gap: 14, paddingBottom: 48 },
  title: { color: '#F2F5ED', fontSize: 38, fontWeight: '800', letterSpacing: -1.2, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: '#BCFA74', fontWeight: '700', fontSize: 20, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: '#192225', padding: 22, gap: 8, borderRadius: 14 },
  kicker: { fontSize: 16, fontWeight: '700', color: '#BCFA74' },
  body: { fontSize: 18, lineHeight: 25, color: '#F2F5ED' },
  muted: { fontSize: 15, lineHeight: 21, color: '#BAC7C1' },
  heading: { fontSize: 20, fontWeight: '700', color: '#F2F5ED' },
  scope: { width: '74%', maxWidth: 220, aspectRatio: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderRadius: 1000 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  band: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 3 },
  caption: { color: '#BAC7C1', textAlign: 'center', fontSize: 16 },
  tools: { marginTop: 12, gap: 12 },
  group: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, borderWidth: 1, borderColor: '#62726F', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#F2F5ED', fontSize: 16, fontWeight: '600' },
  primary: { backgroundColor: '#BCFA74', borderColor: '#BCFA74' },
  primaryText: { color: '#152013', fontWeight: '700', fontSize: 17 },
  selected: { backgroundColor: '#304139', borderColor: '#BCFA74' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
