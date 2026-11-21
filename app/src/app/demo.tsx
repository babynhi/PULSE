import { useState } from 'react';
import Setup from '../demo/Setup';
import Game, { type DemoResult } from '../demo/Game';
import { Recap } from '../demo/Outcomes';

export default function DemoRound() {
  const [stage, setStage] = useState<'setup' | 'game' | 'recap'>('setup');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState<DemoResult | null>(null);

  function finish(result: DemoResult) {
    setSummary(result);
    setStage('recap');
  }

  if (stage === 'setup') return <Setup onStart={(player) => { setName(player); setStage('game'); }} />;
  if (stage === 'recap' && summary) return <Recap result={summary} onReplay={() => setStage('setup')} />;
  return <Game name={name} onEnd={finish} />;
}
