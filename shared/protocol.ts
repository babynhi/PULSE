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

/** Short rounds by default (6 min) keep the energy up and make rematches easy. */
export const DEFAULT_SETTINGS: Settings = {
    durationSec: 6 * 60,
    infectedCount: 1,
    doctorEnabled: true,
    healCharges: 2,
    disperseSec: 20,
    biteHoldMs: 1000,
    healHoldMs: 1000,
    immunitySec: 10,
    reconnectSec: 30,
    maxPlayers: 20,
    zoneEnabled: true,
    zoneStartRadiusM: 100,
    zoneShrinkSec: 90,
    zoneGraceSec: 10,
};

/** Min/max the server clamps each numeric setting to. */
export const SETTING_LIMITS: Record<string, [number, number]> = {
    /** Rounds are 6 to 8 minutes. */
    durationSec: [6 * 60, 8 * 60],
    infectedCount: [1, 10],
    healCharges: [0, 10],
    disperseSec: [0, 300],
    biteHoldMs: [500, 10000],
    healHoldMs: [500, 10000],
    immunitySec: [0, 120],
    reconnectSec: [5, 300],
    /** capped by the number of profile icons (every player has a different one) */
    maxPlayers: [3, 40],
    zoneStartRadiusM: [30, 2000],
    zoneShrinkSec: [30, 900],
    zoneGraceSec: [3, 60],
};

/** Zone shrink rules (not host-configurable). */
export const ZONE_SHRINK_FACTOR = 0.7;
export const ZONE_MIN_RADIUS_M = 20;
export const ZONE_WARNING_MS = 20_000;
/** Infected get a fuzzed, delayed snapshot of the survivors this often. */
export const PING_INTERVAL_MS = 30_000;
/** Rooms with demo players ping faster, so the demo has something moving to show. */
export const DEMO_PING_INTERVAL_MS = 10_000;
/** A ping snapshot is held back this long before infected see it (so it's always stale). */
export const PING_DELAY_MS = 15_000;
export const DEMO_PING_DELAY_MS = 5_000;
/** The doctor can only cure someone infected less than this long ago. After that it's permanent. */
export const HEAL_WINDOW_MS = 60_000;
/** Anonymous infection markers stay on everyone's map this long, fading out. */
export const INFECTION_MARK_MS = 60_000;

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

/** A survivor as infected see them: fuzzed 20-40 m, and `at` = when the position was sampled. */
export interface PingDot extends LatLng {
    /** epoch ms (server clock) when this position was true. The map labels it "30s ago". */
    at: number;
    /** That survivor's profile icon. */
    icon: string;
}

/** Approximate spot where someone was just infected. Anonymous, shown to everyone. */
export interface InfectionMark extends LatLng {
    id: number;
    /** epoch ms (server clock) of the infection */
    at: number;
}

export interface AllyPos extends LatLng {
    id: string;
    name: string;
    icon: string;
}

export const MIN_PLAYERS = 3;

/**
 * Profile icons: 20 original black-and-white creature heads (app/assets/icons), each in a dark
 * version (white creature on black) and a light version (black creature on white) = 40 icons.
 * Each player in a room has a different one (the server enforces it). They show in the lobby, on
 * fellow-infected pins and on survivor pings, so you can tell who is who.
 */
export const ICON_SHAPES = [
    'bunny', 'cat', 'bear', 'frog', 'owl', 'fox', 'pig', 'ghost', 'skull', 'octopus',
    'dog', 'cyclops', 'alien', 'croc', 'monkey', 'donkey', 'ladybug', 'penguin', 'robot', 'sheep',
] as const;
export const PLAYER_ICONS: readonly string[] = [
    ...ICON_SHAPES.map((s) => s),
    ...ICON_SHAPES.map((s) => `${s}-light`),
];

// ---------- Server -> phone ----------

export interface PublicPlayer {
    id: string;
    name: string;
    /** Profile icon, unique in the room. */
    icon: string;
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
    /**
     * Survivors only: how close the nearest infected player is right now (never who).
     * Drives the red danger pulse and heartbeat. Always null for infected players.
     */
    danger?: Zone | null;
    /**
     * Survivors only: how close the nearest infected is, 0 (just in range) to 1 (touching),
     * in steps of 0.05. Drives how hard and fast the heartbeat vibrates. Never says who.
     */
    dangerLevel?: number | null;
}

/** Anonymous kill-feed line, broadcast to everyone ("Someone was infected… 3 survivors left"). */
export interface FeedItem {
    id: number;
    /** epoch ms */
    at: number;
    kind: 'infected' | 'cured' | 'eliminated';
    text: string;
    /** Counts right after this event, for the in-app banner. */
    infectedLeft?: number;
    survivorsLeft?: number;
}

/** End-of-round award. */
export interface Mvp {
    title: string;
    name: string;
    detail: string;
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
    /**
     * Doctor only: true when this player's infection is past the heal window (permanent),
     * so the app hides Hold to Heal for them. The server rejects the heal anyway.
     */
    noHeal?: boolean;
}

export interface Standing {
    name: string;
    icon?: string;
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
    /** Raw material for the infection tree: every bite and cure, in order, with times. */
    events: GameEvent[];
    /** Awards: most infections, longest survivor, best doctor, patient zero. */
    mvps?: Mvp[];
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
    /**
     * Infected only: fuzzed (20-40 m), delayed survivor positions, each with the time it was true.
     * Innocents and the doctor never get pings: their map shows nobody else.
     */
    pings: PingDot[];
    /** When the current ping snapshot was released to this viewer (null = none / not infected). */
    pingAt: number | null;
    /** Recent anonymous infection spots (< INFECTION_MARK_MS old). Everyone sees them. */
    infectionMarks?: InfectionMark[];
    /** Live counts during play: active infected vs active survivors. */
    tally?: { infectedLeft: number; survivorsLeft: number } | null;
    /** Recent anonymous kill-feed lines (newest last). */
    feed?: FeedItem[];
    /**
     * Host only, demo rooms only: the role the host asked to start with ("Test my role").
     * null = random. Undefined for everyone else.
     */
    testRole?: Role | null;
    /** Host only, demo rooms only: Story mode (scripted demo) is on. */
    story?: boolean;
    /** true when this room has demo players: test tools (Test my role, switch role) are allowed. */
    testTools?: boolean;
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
    'room:create': (p: { playerId: string; name: string; icon?: string }, ack: Ack<{ code: string }>) => void;
    /** If the icon is taken (or missing) the server gives the player the first free one. */
    'room:join': (p: { playerId: string; name: string; code: string; icon?: string }, ack: Ack<{ code: string }>) => void;
    /**
     * Host only, demo rooms only: Story mode. Demo players follow a fixed storyline (as innocent:
     * bitten at 20 s, cured at 40 s, survivors win at 50 s; as doctor: an infected walks up at 10 s).
     */
    'lobby:story': (p: { on: boolean }, ack?: Ack) => void;
    /** Host only, demo rooms only: start the next round as this role (null = random). */
    'lobby:testRole': (p: { role: Role | null }, ack?: Ack) => void;
    /** Change your icon in the lobby. Fails if someone else has it. */
    'lobby:icon': (p: { icon: string }, ack?: Ack) => void;
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
    /** Switch your own role mid-round. Allowed on debug servers and in rooms with demo players. */
    'debug:setRole': (p: { role: Role }) => void;
}

export interface ServerToClient {
    'room:state': (v: RoomView) => void;
    notice: (n: Notice) => void;
    'action:progress': (p: ActionProgress) => void;
    'action:end': (p: ActionEnd) => void;
}
