import type { Zone } from '../../../shared/protocol';

export type PracticeMapProps = { band: Zone | 'NONE'; radiusFraction: number | null };

// Native practice rounds use the same Google Maps view as live rounds.
export function PracticeMap(_props: PracticeMapProps) { return null; }
