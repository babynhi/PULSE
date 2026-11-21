import { useState } from 'react';
import { View } from 'react-native';
import Setup from '../demo/Setup';
import Game, { type DemoResult } from '../demo/Game';
import { Zone, Recap } from '../demo/Outcomes';

export default function DemoRound() {
  const [stage, setStage] = useState<'setup' | 'game' | 'zone' | 'recap'>('setup');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState<DemoResult | null>(null);
  const [zoneEnteredAt, setZoneEnteredAt] = useState(0);

  function finish(result: DemoResult) {
    setSummary(result);
    setStage('recap');
  }

  if (stage === 'setup') return <Setup onStart={(player) => { setName(player); setStage('game'); }} />;
  if (stage === 'recap' && summary) return <Recap result={summary} onReplay={() => setStage('setup')} />;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: stage === 'game' ? 'flex' : 'none' }}>
        <Game name={name} onZone={snapshot => { setSummary(snapshot); setZoneEnteredAt(Date.now()); setStage('zone'); }} onEnd={finish} />
      </View>
      {stage === 'zone' && summary && <Zone onBack={() => setStage('game')} onEliminated={() => finish({
        ...summary, elapsedSec: summary.elapsedSec + Math.floor((Date.now() - zoneEnteredAt) / 1000),
        reason: 'You were eliminated outside the safe zone. A survivor remained when the demo round ended.',
      })} />}
    </View>
  );
}
