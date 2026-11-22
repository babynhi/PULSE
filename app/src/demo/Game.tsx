import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { ActionProgress, RadarEntry, Role, Team, Zone as Distance } from '../../../shared/protocol';
import { RoundScreen } from '../rooms/LiveRound';
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

const companions = ['Mara', 'Jules', 'Remy'];
const distances: (Distance | undefined)[] = ['HOT', 'WARM', 'COLD', undefined];

export default function Game({ name, onEnd }: { name: string; onEnd: (result: DemoResult) => void }) {
  const { settings } = useDemoSettings();
  const [start] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const [deck, setDeck] = useState<Role[]>(() => {
    const cards: Role[] = Array<Role>(settings.infectedCount).fill('infected');
    if (settings.doctorEnabled) cards.push('doctor');
    while (cards.length <= companions.length) cards.push('innocent');
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  });
  const role = deck[0];
  const [acked, setAcked] = useState(false);
  const [bites, setBites] = useState(0);
  const [heals, setHeals] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [progress, setProgress] = useState<ActionProgress | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ended = useRef(false);
  const endsAt = start + settings.durationSec * 1000;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(tick); if (timer.current) clearTimeout(timer.current); };
  }, []);

  const finish = useCallback((winner: Team, reason: string, finalDeck: Role[], finalBites: number, finalHeals: number) => {
    if (ended.current) return;
    ended.current = true;
    if (timer.current) clearTimeout(timer.current);
    onEnd({ name, role: finalDeck[0], winner, reason, bites: finalBites, heals: finalHeals,
      elapsedSec: Math.min(settings.durationSec, Math.floor((Date.now() - start) / 1000)),
      standings: companions.map((playerName, i) => ({ name: playerName, role: finalDeck[i + 1] })) });
  }, [name, onEnd, settings.durationSec, start]);

  useEffect(() => {
    if (now >= endsAt) finish('survivors', 'Time ran out with survivors left.', deck, bites, heals);
  }, [now, endsAt, finish, deck, bites, heals]);

  function distanceFor(id: number, time: number) {
    return distances[(id - 1 + Math.floor((time - start) / 12000)) % distances.length];
  }
  const radar: RadarEntry[] = companions.map((companion, i) => {
    const ally = role === 'infected' && deck[i + 1] === 'infected';
    return { bleId: i + 1, ally, zone: distanceFor(i + 1, now), name: ally ? companion : undefined };
  });

  function cancel() {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setProgress(null);
    setFeedback('Hold released.');
  }

  async function begin(id: number) {
    if (timer.current || ended.current) return;
    const kind = role === 'doctor' ? 'heal' : 'bite';
    if (distanceFor(id, Date.now()) !== 'HOT') throw new Error('Move closer and try again.');
    if (kind === 'heal' && deck[id] !== 'infected') throw new Error('No cure needed. You kept your charge.');
    const durationMs = kind === 'heal' ? settings.healHoldMs : settings.biteHoldMs;
    setFeedback('');
    setProgress({ kind, durationMs, startedAt: Date.now(), targetBleId: id });
    timer.current = setTimeout(() => {
      timer.current = null;
      setProgress(null);
      if (ended.current || Date.now() >= endsAt) return;
      if (distanceFor(id, Date.now()) !== 'HOT') { setFeedback('Signal moved out of reach.'); return; }
      const next = [...deck];
      next[id] = kind === 'heal' ? 'innocent' : 'infected';
      setDeck(next);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (kind === 'heal') {
        setHeals(heals + 1);
        setFeedback('Player cured.');
        if (!next.includes('infected')) finish('survivors', 'The last infected player was cured.', next, bites, heals + 1);
      } else {
        setBites(bites + 1);
        setFeedback('Bite landed.');
        if (deck[id] === 'doctor') finish('infected', 'The doctor was infected.', next, bites + 1, heals);
        else if (next.every(r => r === 'infected')) finish('infected', 'Everyone was infected.', next, bites + 1, heals);
      }
    }, durationMs);
  }

  return <RoundScreen me={{ bleId: 0, role, roleAcked: acked, healsLeft: settings.healCharges - heals, status: 'active', immuneUntil: 0,
    outsideZoneSince: null, graceEndsAt: null }}
    name={name} radar={radar} settings={settings} endsAt={endsAt} clockOffset={0} onRoleAck={() => setAcked(true)}
    onStartAction={begin} onCancelAction={cancel} actionProgress={progress} feedback={feedback} zone={<Zone />} />;
}
