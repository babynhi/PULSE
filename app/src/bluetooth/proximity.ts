export type Zone = 'HOT' | 'WARM' | 'COLD';

export interface Reading {
    playerNumber: number;
    zone: Zone;
    rssi: number; // smoothed signal strength, e.g. -58
}

export interface Thresholds {
    hot: number;  // signal >= hot  -> HOT  (about 1-2 m, bite range)
    warm: number; // signal >= warm -> WARM (a few metres)
}

// Starting guesses. We'll calibrate these with your two iPhones in Step 6.
export const DEFAULT_THRESHOLDS: Thresholds = { hot: -62, warm: -78 };

interface Track {
    samples: { t: number; rssi: number }[];
    smoothed: number | null;
    zone: Zone | null;
    lastSeen: number;
}

export class ProximityTracker {
    private tracks = new Map<number, Track>();

    constructor(
        public thresholds: Thresholds = { ...DEFAULT_THRESHOLDS },
        private windowMs = 2000, // how much history to look at
        private staleMs = 4000,  // forget a player after this much silence
        private marginDb = 3,    // how far past a line before we switch back out
        private smoothing = 0.5, // 0..1, lower = smoother but slower
    ) { }

    /** Call every time the scanner hears a player. */
    add(playerNumber: number, rssi: number, t = Date.now()) {
        if (!Number.isFinite(rssi) || rssi >= 0 || rssi < -127) return; // junk values
        let tr = this.tracks.get(playerNumber);
        if (!tr) {
            tr = { samples: [], smoothed: null, zone: null, lastSeen: t };
            this.tracks.set(playerNumber, tr);
        }
        tr.samples.push({ t, rssi });
        tr.lastSeen = t;
    }

    /** Call a few times per second to get everyone's current zone. */
    snapshot(now = Date.now()): Reading[] {
        const out: Reading[] = [];
        for (const [playerNumber, tr] of this.tracks) {
            if (now - tr.lastSeen > this.staleMs) {
                this.tracks.delete(playerNumber);
                continue;
            }
            tr.samples = tr.samples.filter((s) => now - s.t <= this.windowMs);
            if (tr.samples.length) {
                const m = median(tr.samples.map((s) => s.rssi));
                tr.smoothed = tr.smoothed === null ? m : tr.smoothed + this.smoothing * (m - tr.smoothed);
            }
            if (tr.smoothed === null) continue;
            tr.zone = pickZone(tr.smoothed, tr.zone, this.thresholds, this.marginDb);
            out.push({ playerNumber, zone: tr.zone, rssi: Math.round(tr.smoothed) });
        }
        return out.sort((a, b) => b.rssi - a.rssi); // closest first
    }
}

/** Entering a closer zone: cross the line. Leaving it: drop `margin` below the line. */
function pickZone(rssi: number, prev: Zone | null, th: Thresholds, margin: number): Zone {
    const raw: Zone = rssi >= th.hot ? 'HOT' : rssi >= th.warm ? 'WARM' : 'COLD';
    if (prev === 'HOT' && raw !== 'HOT' && rssi >= th.hot - margin) return 'HOT';
    if (prev === 'WARM' && raw === 'COLD' && rssi >= th.warm - margin) return 'WARM';
    return raw;
}

function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}