/**
 * PULSE contract: every message between the phones (app/) and the game server (server/).
 *
 * Rule: the server is the referee. Phones send what they WANT (ready, start a bite,
 * "here's what my Bluetooth hears") and show whatever RoomView the server sends back.
 * Phones never decide that a bite or heal worked.
 *
 * bleId = the player number hidden in the Bluetooth ID (see app/src/bluetooth/ids.ts).
 * If you change this file, tell your teammate: both sides depend on it.
 */

// ---------- Basic types ----------

export type Role = 'infected' | 'innocent' | 'doctor';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'ended';
/** Proximity bucket. RSSI is not a distance, so we only ever talk in buckets. */
export type Zone = 'HOT' | 'WARM' | 'COLD';
export type PlayerStatus = 'active' | 'eliminated';
export type Team = 'infected' | 'survivors';
export type ActionKind = 'bite' | 'heal';

// ---------- Settings ----------

export interface Settings {
    durationSec: number;
    infectedCount: number;
    doctorEnabled: boolean;
    healCharges: number;
    disperseSec: number;
    biteHoldMs: number;
    healHoldMs: number;
    immunitySec: number;
    reconnectSec: number;
    maxPlayers: number;
    /** Shrinking GPS safe zone. false = house-party mode (no zone). */
    zoneEnabled: boolean;
    zoneStartRadiusM: number;
    zoneShrinkSec: number;
    zoneGraceSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
    durationSec: 15 * 60,
    infectedCount: 1,
    doctorEnabled: true,
    healCharges: 2,
    disperseSec: 30,
    biteHoldMs: 1000,
    healHoldMs: 1000,
    immunitySec: 10,
    reconnectSec: 30,
    maxPlayers: 20,
    zoneEnabled: true,
    zoneStartRadiusM: 150,
    zoneShrinkSec: 180,
    zoneGraceSec: 10,
};

/** Min/max the server clamps each numeric setting to. */
export const SETTING_LIMITS: Record<string, [number, number]> = {
    durationSec: [60, 60 * 60],
    infectedCount: [1, 10],
    healCharges: [0, 10],
    disperseSec: [0, 300],
    biteHoldMs: [500, 10000],
    healHoldMs: [500, 10000],
    immunitySec: [0, 120],
    reconnectSec: [5, 300],
    maxPlayers: [3, 50],
    zoneStartRadiusM: [30, 2000],
    zoneShrinkSec: [30, 900],
    zoneGraceSec: [3, 60],
};

/** Zone shrink rules (not host-configurable). */
export const ZONE_SHRINK_FACTOR = 0.7;
export const ZONE_MIN_RADIUS_M = 20;
export const ZONE_WARNING_MS = 30_000;
/** Everyone's fuzzed position is pinged to everyone this often. */
export const PING_INTERVAL_MS = 30_000;
/** Rooms with demo players ping faster, so the demo has something moving to show. */
export const DEMO_PING_INTERVAL_MS = 10_000;

export interface LatLng {
    lat: number;
    lng: number;
}

export interface ZoneView {
    center: LatLng;
    radiusM: number;
    /** radius after the next shrink (null when already at minimum) */
    nextRadiusM: number | null;
    /** epoch ms of the next shrink, null when it won't shrink again */
    shrinksAt: number | null;
    /** true during the last ZONE_WARNING_MS before a shrink */
    warning: boolean;
}

export interface AllyPos extends LatLng {
    id: string;
    name: string;
}

export const MIN_PLAYERS = 3;

// ---------- Server -> phone ----------

export interface PublicPlayer {
    id: string;
    name: string;
    isHost: boolean;
    isBot: boolean;
    /** Simulated "demo" player the host added (walks around on fake GPS). */
    isDemo?: boolean;
    ready: boolean;
    connected: boolean;
    /** Eliminated is public. Roles never are (until the end screen). */
    status: PlayerStatus;
}

/** Private, per-player game state. Only ever sent to that player. */
export interface MyState {
    bleId: number;
    /** null during the dispersal countdown: roles unlock when the round starts. */
    role: Role | null;
    roleAcked: boolean;
    healsLeft: number;
    /** epoch ms; cured players can't be bitten before this. */
    immuneUntil: number;
    status: PlayerStatus;
    /** epoch ms when this player left the zone (null = inside or unknown) */
    outsideZoneSince: number | null;
    /** epoch ms when the player is eliminated if still outside */
    graceEndsAt: number | null;
}

/** Registered devices this player may see on radar. */
export interface RadarEntry {
    bleId: number;
    /** Strongest fresh proximity bucket reported by either phone. Absent when out of sight. */
    zone?: Zone;
    /** true only when the viewer is infected and so is this player. */
    ally: boolean;
    /** Only filled for allies. Everyone else is anonymous. */
    name?: string;
}

export interface Standing {
    name: string;
    startRole: Role;
    finalRole: Role;
    status: PlayerStatus;
    bites: number;
    heals: number;
    timesCured: number;
}

export interface GameEvent {
    /** ms since round start */
    t: number;
    kind: 'bite' | 'heal' | 'eliminated';
    actor?: string;
    target: string;
}

export interface GameResult {
    winner: Team;
    reason: string;
    durationSec: number;
    infectedTotal: number;
    curedTotal: number;
    eliminatedTotal: number;
    standings: Standing[];
    /** Raw material for the Phase 3 infection tree. */
    events: GameEvent[];
}

export interface RoomView {
    code: string;
    phase: Phase;
    /** Server clock, so phones can correct countdowns for clock differences. */
    serverNow: number;
    youId: string;
    hostId: string;
    players: PublicPlayer[];
    settings: Settings;
    /** Bumps on every settings change; with changedKeys lets the UI flash the changed rows. */
    settingsVersion: number;
    changedKeys: (keyof Settings)[];
    canStart: boolean;
    startBlockers: string[];
    warnings: string[];
    countdownEndsAt: number | null;
    endsAt: number | null;
    me: MyState | null;
    radar: RadarEntry[];
    /** Debug-only fake proximity set from the debug panel, keyed by bleId. */
    debugProx: Record<number, Zone>;
    debugEnabled: boolean;
    result: GameResult | null;
    /** Current safe zone, null when off / not started / no GPS. */
    zone: ZoneView | null;
    /** Live positions of fellow infected. Only ever sent to infected players. */
    allies: AllyPos[];
    /** Last auto-ping: fuzzed positions of every other active player. */
    pings: LatLng[];
    pingAt: number | null;
    /** How often pings arrive in this room (PING_INTERVAL_MS, or faster with demo players). */
    pingEveryMs?: number;
}

export type NoticeKind =
    | 'youWereInfected'
    | 'youWereCured'
    | 'biteLanded'
    | 'healLanded'
    | 'healNoEffect'
    | 'eliminated'
    | 'kicked'
    | 'youAreHost'
    | 'info';

export interface Notice {
    kind: NoticeKind;
    text: string;
}

export interface ActionProgress {
    kind: ActionKind;
    targetBleId: number;
    startedAt: number;
    durationMs: number;
}

export interface ActionEnd {
    kind: ActionKind;
    ok: boolean;
    reason?: string;
}

// ---------- Phone -> server ----------

/** What one phone's Bluetooth currently hears. Sent ~every 500 ms while playing. */
export interface ProxReading {
    bleId: number;
    zone: Zone;
    /** smoothed RSSI in dBm, for logging/calibration only */
    rssi: number;
}

export type Ack<T = {}> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServer {
    'room:create': (p: { playerId: string; name: string }, ack: Ack<{ code: string }>) => void;
    'room:join': (p: { playerId: string; name: string; code: string }, ack: Ack<{ code: string }>) => void;
    'room:leave': (ack?: () => void) => void;
    'lobby:ready': (p: { ready: boolean }) => void;
    'lobby:settings': (p: { patch: Partial<Settings> }, ack?: Ack) => void;
    'lobby:kick': (p: { playerId: string }) => void;
    'lobby:transferHost': (p: { playerId: string }) => void;
    /** Host only: add 3 simulated demo players who walk around on fake GPS near the host. */
    'lobby:addDemo': (ack?: Ack) => void;
    'game:start': (ack: Ack) => void;
    'game:roleAck': () => void;
    'game:playAgain': () => void;
    'prox:report': (p: { readings: ProxReading[] }) => void;
    /** My GPS position, sent every few seconds during the round. */
    'loc:report': (p: { lat: number; lng: number; acc?: number }) => void;
    'action:start': (p: { targetBleId: number }, ack: Ack) => void;
    'action:cancel': () => void;
    // Debug panel: test without real Bluetooth (bots, fake distances, skip timer)
    'debug:addBots': (p: { count: number }) => void;
    'debug:setProx': (p: { targetBleId: number; zone: Zone | null }) => void;
    'debug:skip': () => void;
    'debug:botRoam': (p: { on: boolean }) => void;
    'debug:setRole': (p: { role: Role }) => void;
}

export interface ServerToClient {
    'room:state': (v: RoomView) => void;
    notice: (n: Notice) => void;
    'action:progress': (p: ActionProgress) => void;
    'action:end': (p: ActionEnd) => void;
}
