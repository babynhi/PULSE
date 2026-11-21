import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Role, Settings, Team, Zone as Distance } from '../../../shared/protocol';
import { Zone } from './Outcomes';
import { useDemoSettings } from './settings';

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
  innocent: { title: 'Innocent', color: '#8CCFFF', objective: 'Avoid infected players and survive until time runs out.' },
  doctor: { title: 'Doctor', color: '#BCFA74', objective: 'Cure infected players. If you are bitten, the infected win.' },
  infected: { title: 'Infected', color: '#FFA58F', objective: 'Bite nearby survivors to infect them.' },
};

const bands: { value: Distance; label: string }[] = [
  { value: 'HOT', label: 'Very close' }, { value: 'WARM', label: 'Nearby' }, { value: 'COLD', label: 'Farther away' },
];

interface Player {
  name: string;
  role: Role;
  distance: Distance;
}

function makePlayers(role: Role, settings: Settings): Player[] {
  const numInfected = settings.infectedCount - Number(role === 'infected');
  return ['Mara', 'Jules', 'Remy'].map((name, index) => ({
    name, distance: bands[index].value,
    role: index < numInfected ? 'infected' : settings.doctorEnabled && role !== 'doctor' && index === 2 ? 'doctor' : 'innocent',
  }));
}

function clock(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

type GameProps = { name: string; onEnd: (result: DemoResult) => void };

export default function Game({ name, onEnd }: GameProps) {
  const { settings } = useDemoSettings();
  const allowedRoles = (Object.keys(roles) as Role[]).filter(role => {
    if (role === 'doctor') return settings.doctorEnabled;
    if (role === 'innocent') return settings.infectedCount + Number(settings.doctorEnabled) < 4;
    return true;
  });
  const [role, setRole] = useState<Role>(() => allowedRoles[0]);
  const [stage, setStage] = useState<'sealed' | 'revealed' | 'playing'>('sealed');
  const [options, setOptions] = useState(false);
  const [selected, setSelected] = useState(0);
  const [players, setPlayers] = useState(() => makePlayers(role, settings));
  const [bites, setBites] = useState(0);
  const [heals, setHeals] = useState(0);
  const [immuneUntil, setImmuneUntil] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [start, setStart] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const remaining = Math.max(0, settings.durationSec - elapsed);
  const immunity = Math.max(0, Math.ceil((immuneUntil - now) / 1000));
  const target = players[selected];
  const action = role === 'doctor' ? 'Heal' : 'Bite';
  const holdMs = role === 'doctor' ? settings.healHoldMs : settings.biteHoldMs;
  const charges = Math.max(0, settings.healCharges - heals);
  const canAct = target.distance === 'HOT' && (role === 'doctor' ? charges > 0 : role === 'infected' && target.role !== 'infected');
  const pingAge = elapsed % settings.pingIntervalSec;
  const pingActive = elapsed >= settings.pingIntervalSec && pingAge < settings.pingDurationSec;

  function cancelHold(announce = false) {
    if (!holdTimer.current) return;
    clearInterval(holdTimer.current);
    holdTimer.current = null;
    setProgress(0);
    if (announce) setFeedback('Hold cancelled.');
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        cancelHold();
        setStage(previous => previous === 'revealed' ? 'sealed' : previous);
      }
    });
    return () => {
      clearInterval(timer);
      if (holdTimer.current) clearInterval(holdTimer.current);
      sub.remove();
    };
  }, []);

  function finish(winner: Team, reason: string, roster = players, finalRole = role, biteCount = bites) {
    onEnd({ name, role: finalRole, winner, reason, bites: biteCount, heals, elapsedSec: elapsed,
      standings: roster.map(player => ({ name: player.name, role: player.role })) });
  }

  useEffect(() => {
    if (remaining === 0) finish('survivors', 'Time expired with survivors still active.');
  });

  function restart(next: Role) {
    cancelHold();
    setPlayers(makePlayers(next, settings));
    setSelected(0);
    setRole(next);
    setStage('sealed');
    setOptions(false);
    setFeedback('');
    setBites(0);
    setHeals(0);
    setImmuneUntil(0);
    setStart(now);
  }

  function beginHold() {
    if (!canAct || holdTimer.current) return;
    setFeedback('');
    const started = Date.now();
    setProgress(0.01);
    holdTimer.current = setInterval(() => {
      const fraction = Math.min(1, (Date.now() - started) / holdMs);
      if (fraction < 1) return setProgress(fraction);
      cancelHold();
      if (role === 'doctor' && target.role !== 'infected') {
        setFeedback('Healing had no effect. You kept your charge.');
        return;
      }
      const nextRole: Role = role === 'doctor' ? 'innocent' : 'infected';
      const next = players.map((player, index) => index === selected ? { ...player, role: nextRole } : player);
      setPlayers(next);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (role === 'doctor') {
        setHeals(heals + 1);
        setFeedback('Player cured.');
      } else {
        setBites(bites + 1);
        if (target.role === 'doctor') finish('infected', 'The doctor was infected.', next, role, bites + 1);
        else if (next.every(player => player.role === 'infected')) finish('infected', 'Every remaining player was infected.', next, role, bites + 1);
        else setFeedback('Player infected.');
      }
    }, 50);
  }

  function receiveAction() {
    cancelHold();
    if (role === 'infected') {
      setRole('innocent');
      setImmuneUntil(now + settings.immunitySec * 1000);
      setFeedback('You were cured.');
    } else if (immunity) {
      setFeedback('Your immunity blocked the bite.');
    } else if (role === 'doctor') {
      finish('infected', 'You were bitten while playing as the doctor.', players, 'infected');
    } else {
      setRole('infected');
      if (players.every(player => player.role === 'infected')) finish('infected', 'Every remaining player was infected.', players, 'infected');
      else setFeedback('You were infected.');
    }
  }

  const demoControls = <View style={s.group}>
    <Control label={options ? 'Hide demo controls' : 'Demo controls'} onPress={() => setOptions(!options)} />
    {options && <View style={s.card}>
      <Text style={s.label}>Restart as</Text>
      <View style={s.wrap}>{allowedRoles.map(value => <Control key={value} label={roles[value].title} onPress={() => restart(value)} />)}</View>
      {stage === 'playing' && <>
        <Text style={s.label}>Move selected player</Text>
        <View style={s.wrap}>{bands.map(({ value, label }) => <Control key={value} label={label} selected={target.distance === value}
          onPress={() => {
            cancelHold(true);
            setPlayers(previous => previous.map((player, i) => i === selected ? { ...player, distance: value } : player));
            void Haptics.selectionAsync().catch(() => {});
          }} />)}</View>
        <Control label={role === 'infected' ? 'Simulate being cured' : 'Simulate being bitten'} onPress={receiveAction} />
        <Control label="Finish demo round" onPress={() => finish('survivors', 'The demo round ended with survivors still active.')} />
      </>}
    </View>}
  </View>;

  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {stage !== 'playing' ? <>
      <Text accessibilityRole="header" style={s.title}>{stage === 'sealed' ? 'Private assignment' : roles[role].title}</Text>
      <View style={[s.card, { borderLeftColor: stage === 'sealed' ? '#BCFA74' : roles[role].color, borderLeftWidth: 4 }]}>
        <Text style={s.label}>{name}</Text>
        <Text style={s.body}>{stage === 'sealed' ? 'Check that only you can see this screen, then reveal your role.' : roles[role].objective}</Text>
        {stage === 'revealed' && role === 'doctor' && <Text style={s.muted}>Healing charges · {settings.healCharges}</Text>}
      </View>
      <Control primary label={stage === 'sealed' ? 'Reveal my role' : 'Hide role and enter game'} onPress={() => {
        setOptions(false); setStage(stage === 'sealed' ? 'revealed' : 'playing');
      }} />
    </> : <>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>Round</Text>
        <View><Text style={s.muted}>Time left</Text><Text style={s.time}>{clock(remaining)}</Text></View></View>
      <Zone showDemoControls={options} onEliminated={() => {
        const infectedWin = players.every(player => player.role === 'infected');
        finish(infectedWin ? 'infected' : 'survivors', 'You were eliminated outside the boundary. ' +
          (infectedWin ? 'Only infected players remained.' : 'A survivor remained when the demo round ended.'));
      }} />
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.heading}>Nearby players</Text>
        <Text style={s.muted}>{pingActive ? 'Player ping · ' + (settings.pingDurationSec - pingAge) + 's left' : 'Next ping in ' + clock(settings.pingIntervalSec - pingAge)}</Text>
        {bands.map(({ value, label }) => {
          const matches = players.map((player, index) => ({ ...player, index })).filter(player => player.distance === value);
          if (!matches.length) return null;
          return <View key={value} style={s.group}>
            <Text style={s.label}>{label}</Text>
            <View style={s.wrap}>{matches.map((player, index) => {
              const ally = role === 'infected' && player.role === 'infected';
              const text = ally ? player.name + ' · Ally' : matches.length === 1 ? 'Player' : 'Player ' + (index + 1);
              return <Control key={player.name} selected={selected === player.index} label={text} accessibleLabel={label + ': ' + text}
                onPress={() => { cancelHold(true); setSelected(player.index); setFeedback(''); }} />;
            })}</View>
          </View>;
        })}
        {role !== 'innocent' && <>
          {role === 'doctor' && <Text style={s.muted}>Healing charges · {charges} / {settings.healCharges}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canAct }} disabled={!canAct}
            accessibilityLabel={'Hold to ' + action.toLowerCase()} accessibilityHint={'Keep pressed for ' + holdMs / 1000 + ' seconds'}
            onPressIn={beginHold} onPressOut={() => cancelHold(true)} style={[s.button, s.primary, !canAct && s.disabled]}>
            <Text style={s.primaryText}>{progress ? action + ' · ' + Math.ceil(progress * 100) + '%' : 'Hold to ' + action.toLowerCase() + ' · ' + holdMs / 1000 + 's'}</Text>
          </Pressable>
          {!canAct && <Text style={s.muted}>{!charges && role === 'doctor' ? 'No healing charges left.' :
            role === 'infected' && target.role === 'infected' ? 'Choose a player outside your team.' : 'Move very close to the selected player.'}</Text>}
        </>}
        {immunity > 0 && <Text style={s.label}>Protected from bites · {immunity}s</Text>}
        {feedback !== '' && <Text accessibilityLiveRegion="polite" style={s.body}>{feedback}</Text>}
      </View>
    </>}
    {demoControls}
  </ScrollView>;
}

function Control({ label, accessibleLabel, onPress, primary, selected }: { label: string; accessibleLabel?: string; onPress: () => void; primary?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibleLabel} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [s.button, primary && s.primary, selected && s.selected, pressed && s.pressed]}>
    <Text style={primary ? s.primaryText : s.buttonText}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101518' },
  content: { width: '100%', maxWidth: 580, alignSelf: 'center', padding: 20, gap: 16, paddingBottom: 48 },
  title: { color: '#F2F5ED', fontSize: 38, fontWeight: '800', letterSpacing: -1.2, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: '#BCFA74', fontWeight: '700', fontSize: 22, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: '#192225', padding: 18, gap: 14, borderRadius: 14 },
  body: { fontSize: 18, lineHeight: 25, color: '#F2F5ED' },
  muted: { fontSize: 15, lineHeight: 21, color: '#BAC7C1' },
  heading: { fontSize: 23, fontWeight: '700', color: '#F2F5ED' },
  label: { fontSize: 16, fontWeight: '700', color: '#E6EDDF' },
  group: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, borderWidth: 1, borderColor: '#62726F', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#F2F5ED', fontSize: 16, fontWeight: '600' },
  primary: { backgroundColor: '#BCFA74', borderColor: '#BCFA74' },
  primaryText: { color: '#152013', fontWeight: '700', fontSize: 17 },
  selected: { backgroundColor: '#304139', borderColor: '#BCFA74' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
