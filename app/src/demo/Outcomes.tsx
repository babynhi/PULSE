import type { Role, Zone as Distance } from '../../../shared/protocol';
import { MapWithRadar } from '../rooms/MapRadar';
import { RoundRecap } from '../rooms/Recap';
import type { DemoResult } from './Game';
import { useDemoSettings } from './settings';
import { PracticeMap } from './PracticeMap';

const demoPosition = { lat: 42.372, lng: -71.12 };

export function Zone({ startedAt, now, role, band }: { startedAt: number; now: number; role: Role; band: Distance | 'NONE' }) {
  const { settings } = useDemoSettings();
  const intervalMs = Math.max(1, settings.zoneShrinkSec) * 1000;
  const shrinks = Math.min(5, Math.floor(Math.max(0, now - startedAt) / intervalMs));
  const radiusM = settings.zoneStartRadiusM * Math.pow(0.8, shrinks);
  const shrinksAt = shrinks < 5 ? startedAt + (shrinks + 1) * intervalMs : null;
  const zone = settings.zoneEnabled ? {
    center: demoPosition, radiusM, shrinksAt, nextRadiusM: shrinksAt === null ? null : radiusM * 0.8,
    warning: shrinksAt !== null && shrinksAt - now <= settings.zoneWarningSec * 1000,
  } : null;
  return <MapWithRadar room={{ me: { role }, zone, allies: [], pings: [], pingAt: null }}
    position={demoPosition} now={now} band={band}
    demoFallback={<PracticeMap band={band} radiusFraction={zone ? radiusM / settings.zoneStartRadiusM : null} />} />;
}

export function Recap({ result, onReplay }: { result: DemoResult; onReplay: () => void }) {
  return <RoundRecap winner={result.winner} reason={result.reason} role={result.role} durationSec={result.elapsedSec}
    totals={[[result.bites, 'Your bites'], [result.heals, 'Your cures']]}
    standings={[
      { name: result.name, startRole: result.startRole, status: result.role },
      ...result.standings.map(player => ({ name: player.name, startRole: player.startRole, status: player.role })),
    ]} events={result.events} viewer={result.name} onReplay={onReplay} />;
}
