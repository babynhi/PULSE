/**
 * Pure game rules for one room. No sockets in here: index.ts wires this to Socket.IO,
 * and the tests drive it directly with a fake clock.
 *
 * Everything that changes the outcome (bites, heals, eliminations, victory) is decided
 * here, never on a phone.
 */
import {
    ActionEnd,
    ActionKind,
    ActionProgress,
    DEFAULT_SETTINGS,
    GameEvent,
    GameResult,
    MIN_PLAYERS,
    Notice,
    PlayerStatus,
    ProxReading,
    RadarEntry,
    Role,
    RoomView,
    SETTING_LIMITS,
    Settings,
    Team,
    Zone,
    ZoneView,
    LatLng,
    AllyPos,
    FeedItem,
    Mvp,
    ZONE_SHRINK_FACTOR,
    ZONE_MIN_RADIUS_M,
    ZONE_WARNING_MS,
    PING_INTERVAL_MS,
    DEMO_PING_INTERVAL_MS,
    PLAYER_ICONS,
    PING_DELAY_MS,
    DEMO_PING_DELAY_MS,
    HEAL_WINDOW_MS,
    INFECTION_MARK_MS,
    InfectionMark,
    PingDot,
} from '../../shared/protocol';

/** A GPS fix older than this is treated as unknown (never counts as "outside"). */
export const LOC_STALE_MS = 30_000;
/** If nobody has a fix this long into the round, the zone is turned off for the round. */
export const ZONE_FIX_WAIT_MS = 30_000;
/** Pings are fuzzed by a random distance in this range (metres). */
export const PING_FUZZ_M: [number, number] = [20, 40];
/** Infection markers are placed this far (random) from where it really happened. */
export const MARK_FUZZ_M: [number, number] = [5, 15];

interface ZoneState {
    center: LatLng;
    radiusM: number;
    nextRadiusM: number | null;
    shrinksAt: number | null;
    warnedFor: number | null;
}

export class GameError extends Error { }

// ---------- demo players (simulated people on fake GPS) ----------

export const DEMO_NAMES = ['Maya', 'Jordan', 'Sam'];
/** Demo players move once a second, like a phone's GPS updates. */
export const DEMO_STEP_MS = 1000;
/** Normal walking pace range (m/s). */
export const DEMO_WALK_MPS: [number, number] = [1.2, 1.6];
/** Hard cap: a demo player never moves faster than this. */
export const DEMO_MAX_MPS = 1.6;
/** Chasing/approaching is a bit slower than walking pace, so a real player can get away. */
export const DEMO_CHASE_MPS = 1.0;
/** GPS distance -> proximity bucket for demo players (beyond COLD = out of Bluetooth range). */
export const DEMO_HOT_M = 5;
export const DEMO_WARM_M = 15;
export const DEMO_COLD_M = 50;
/** A real player's GPS fix must be this fresh to count for demo proximity. */
export const DEMO_FIX_FRESH_MS = 10_000;
/** How long a demo bot must stay HOT on a target before it starts a bite / heal. */
export const DEMO_BITE_AFTER_MS = 2000;
/** Doctors react faster than biters, so a demo doctor walking up to an infected usually wins the race. */
export const DEMO_HEAL_AFTER_MS = 1000;
/** Spawn ring around the host. */
export const DEMO_SPAWN_M: [number, number] = [20, 60];
/** Keep this far inside the zone edge (and within this radius of spawn before the zone exists). */
const DEMO_EDGE_MARGIN_M = 8;
const DEMO_LEASH_M = 70;
const DEMO_TURN_DEG_PER_S = 70;

interface DemoBot {
    pos: LatLng;
    /** where it spawned; used as the play area before the zone is placed */
    anchor: LatLng;
    heading: number;
    /** wander turn rate, deg/s, drifts smoothly */
    turn: number;
    pace: number;
    pauseUntil: number;
    hotTargetId: string | null;
    hotSince: number;
}

/** Story mode timings (ms from round start, or after the previous story beat). */
export const STORY_BITE_MS = 20_000;
export const STORY_CURE_HOST_AFTER_MS = 20_000;
export const STORY_CURE_ZOMBIE_AFTER_MS = 10_000;
export const STORY_DOCTOR_APPROACH_MS = 10_000;

/** A bite/heal hold may survive a brief signal dropout of this length. */
export const PROX_GRACE_MS = 700;
/** A proximity reading older than this doesn't count. */
export const PROX_STALE_MS = 2000;

export interface Player {
    id: string;
    name: string;
    /** profile icon, unique in the room */
    icon: string;
    isBot: boolean;
    connected: boolean;
    joinedAt: number;
    disconnectedAt: number | null;
    ready: boolean;
    // game
    /** simulated demo player (also isBot) */
    demo?: boolean;
    bleId: number;
    role: Role | null;
    startRole: Role | null;
    roleAcked: boolean;
    status: PlayerStatus;
    healsLeft: number;
    immuneUntil: number;
    bites: number;
    heals: number;
    timesCured: number;
    outsideZoneSince: number | null;
    /** epoch ms this player was (last) infected; 0 = not infected. Drives the heal window. */
    infectedAt?: number;
}

interface Hold {
    actorId: string;
    targetId: string;
    kind: ActionKind;
    startedAt: number;
    lastOkAt: number;
    durationMs: number;
}

export interface RoomOutput {
    notice(playerId: string, n: Notice): void;
    actionProgress(playerId: string, p: ActionProgress): void;
    actionEnd(playerId: string, p: ActionEnd): void;
}

const NOOP_OUT: RoomOutput = { notice() { }, actionProgress() { }, actionEnd() { } };

export class Room {
    phase: RoomView['phase'] = 'lobby';
    players = new Map<string, Player>();
    hostId = '';
    settings: Settings = { ...DEFAULT_SETTINGS };
    settingsVersion = 0;
    changedKeys: (keyof Settings)[] = [];
    countdownEndsAt: number | null = null;
    startedAt: number | null = null;
    endsAt: number | null = null;
    result: GameResult | null = null;
    events: GameEvent[] = [];
    holds = new Map<string, Hold>(); // by actorId
    /** reporterId -> bleId -> latest reading */
    prox = new Map<string, Map<number, ProxReading & { at: number }>>();
    /** debug fake proximity, key = sorted "idA|idB" */
    debugProx = new Map<string, Zone>();
    botRoam = false;
    private lastBotStep = 0;
    /** simulated demo players' walking state, by player id */
    demoBots = new Map<string, DemoBot>();
    private lastDemoStep = 0;
    /** anonymous kill feed for this round (newest last) */
    feed: FeedItem[] = [];
    private feedSeq = 0;
    /** playerId -> ms into the round when they were first infected (0 = started infected) */
    private firstInfectedAt = new Map<string, number>();
    /** latest GPS fix per player */
    positions = new Map<string, LatLng & { at: number }>();
    zone: ZoneState | null = null;
    /** waiting for the first GPS fix to place the zone */
    private zonePending = false;
    /** released ping (what infected see): playerId -> fuzzed position, sampled at pingSampledAt */
    pings = new Map<string, LatLng>();
    /** when the released ping became visible */
    pingAt: number | null = null;
    pingSampledAt: number | null = null;
    /** sampled but not yet released (held back by the ping delay) */
    private pingQueue: { at: number; dots: Map<string, LatLng> }[] = [];
    private lastPingSample: number | null = null;
    /** host's "Test my role" choice for the next round (demo rooms only), null = random */
    testRole: Role | null = null;
    /** Story mode (demo rooms only): demo players follow a fixed, timed storyline. */
    story = false;
    /** per-round story state */
    private storyState: { bitAt: number | null; curedHostAt: number | null; from: Map<string, LatLng> } | null = null;
    /** recent anonymous infection spots */
    marks: InfectionMark[] = [];
    private markSeq = 0;
    /** set whenever something visible changed; index.ts re-broadcasts and clears it */
    dirty = true;

    constructor(
        public code: string,
        public out: RoomOutput = NOOP_OUT,
        public debugEnabled = true,
        private rng: () => number = Math.random,
    ) { }

    // ---------- membership ----------

    /** Adds a player, or reconnects an existing one with the same id. Returns the player. */
    join(playerId: string, rawName: string, now: number, isBot = false, icon?: unknown): Player {
        const existing = this.players.get(playerId);
        if (existing) {
            existing.connected = true;
            existing.disconnectedAt = null;
            this.dirty = true;
            return existing;
        }
        if (this.phase !== 'lobby') throw new GameError('Game already started');
        if (this.players.size >= this.settings.maxPlayers) throw new GameError('Room is full');
        const name = this.uniqueName(rawName);
        const p: Player = {
            id: playerId,
            name,
            icon: this.freeIcon(icon),
            isBot,
            connected: true,
            joinedAt: now,
            disconnectedAt: null,
            ready: isBot,
            bleId: 0,
            role: null,
            startRole: null,
            roleAcked: false,
            status: 'active',
            healsLeft: 0,
            immuneUntil: 0,
            bites: 0,
            heals: 0,
            timesCured: 0,
            outsideZoneSince: null,
        };
        this.players.set(playerId, p);
        if (!this.hostId) this.hostId = playerId;
        this.dirty = true;
        return p;
    }

    /** The requested icon if it's a real one and nobody has it, else the first free icon. */
    private freeIcon(wanted: unknown, except?: string): string {
        const taken = new Set([...this.players.values()].filter((p) => p.id !== except).map((p) => p.icon));
        if (typeof wanted === 'string' && (PLAYER_ICONS as readonly string[]).includes(wanted) && !taken.has(wanted)) return wanted;
        return PLAYER_ICONS.find((i) => !taken.has(i)) ?? PLAYER_ICONS[0];
    }

    /** Lobby only: pick a different icon. */
    setIcon(playerId: string, icon: unknown) {
        const p = this.players.get(playerId);
        if (!p) return;
        if (this.phase !== 'lobby') throw new GameError('You can only change your icon in the lobby');
        if (typeof icon !== 'string' || !(PLAYER_ICONS as readonly string[]).includes(icon)) throw new GameError('Unknown icon');
        if ([...this.players.values()].some((o) => o.id !== playerId && o.icon === icon)) throw new GameError('Someone already has that icon');
        p.icon = icon;
        this.dirty = true;
    }

    private uniqueName(raw: string): string {
        const base = (raw || '').trim().slice(0, 20) || 'Player';
        const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        for (let i = 2; ; i++) {
            const n = `${base} ${i}`;
            if (!taken.has(n.toLowerCase())) return n;
        }
    }

    disconnect(playerId: string, now: number) {
        const p = this.players.get(playerId);
        if (!p || !p.connected) return;
        p.connected = false;
        p.disconnectedAt = now;
        this.cancelHoldsInvolving(playerId, 'Signal lost');
        if (this.hostId === playerId) this.migrateHost();
        this.dirty = true;
    }

    /** Deliberate exit. In the lobby you just leave; mid-round it counts as elimination. */
    leave(playerId: string, now: number) {
        const p = this.players.get(playerId);
        if (!p) return;
        if (this.phase === 'lobby' || this.phase === 'ended') {
            this.players.delete(playerId);
            this.prox.delete(playerId);
            if (this.hostId === playerId) this.migrateHost();
        } else {
            p.connected = false;
            p.disconnectedAt = now;
            this.eliminate(p, now, 'Left the game', 'Someone left the game');
            if (this.hostId === playerId) this.migrateHost();
        }
        this.dirty = true;
    }

    kick(byId: string, playerId: string) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Can only kick in the lobby');
        if (playerId === byId) throw new GameError("Can't kick yourself");
        if (!this.players.has(playerId)) return;
        this.out.notice(playerId, { kind: 'kicked', text: 'The host removed you from the room.' });
        this.players.delete(playerId);
        this.dirty = true;
    }

    transferHost(byId: string, playerId: string) {
        this.requireHost(byId);
        const p = this.players.get(playerId);
        if (!p || p.isBot || !p.connected) throw new GameError('That player can’t be host');
        this.hostId = playerId;
        this.out.notice(playerId, { kind: 'youAreHost', text: 'You are now the host.' });
        this.dirty = true;
    }

    private migrateHost() {
        const next = [...this.players.values()]
            .filter((p) => p.connected && !p.isBot && p.id !== this.hostId)
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (next) {
            this.hostId = next.id;
            this.out.notice(next.id, { kind: 'youAreHost', text: 'The host left. You are now the host.' });
        } else if (!this.players.has(this.hostId)) {
            this.hostId = '';
        }
    }

    private requireHost(id: string) {
        if (id !== this.hostId) throw new GameError('Only the host can do that');
    }

    isEmpty() {
        return ![...this.players.values()].some((p) => !p.isBot && p.connected);
    }

    // ---------- lobby ----------

    setReady(playerId: string, ready: boolean) {
        const p = this.players.get(playerId);
        if (!p || this.phase !== 'lobby') return;
        p.ready = ready;
        this.dirty = true;
    }

    updateSettings(byId: string, patch: Partial<Settings>) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Settings are locked during a round');
        const changed: (keyof Settings)[] = [];
        for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
            if (!(k in DEFAULT_SETTINGS)) continue;
            const def = DEFAULT_SETTINGS[k];
            let val: number | boolean;
            if (typeof def === 'boolean') {
                if (typeof v !== 'boolean') continue;
                val = v;
            } else {
                if (typeof v !== 'number' || !Number.isFinite(v)) continue;
                const [lo, hi] = SETTING_LIMITS[k] ?? [0, Infinity];
                val = Math.round(Math.min(hi, Math.max(lo, v)));
            }
            if (this.settings[k] !== val) {
                (this.settings as any)[k] = val;
                changed.push(k);
            }
        }
        if (changed.length) {
            this.settingsVersion++;
            this.changedKeys = changed;
            // Changing the rules un-readies everyone so nobody starts on settings they didn't see.
            for (const p of this.players.values()) if (!p.isBot) p.ready = false;
            this.dirty = true;
        }
    }

    connectedPlayers() {
        return [...this.players.values()].filter((p) => p.connected);
    }

    startBlockers(): string[] {
        const b: string[] = [];
        const conn = this.connectedPlayers();
        const n = conn.length;
        if (n < MIN_PLAYERS) b.push(`Need at least ${MIN_PLAYERS} players (have ${n})`);
        const notReady = conn.filter((p) => !p.ready && p.id !== this.hostId);
        if (notReady.length) b.push(`Waiting for ${notReady.map((p) => p.name).join(', ')} to be ready`);
        const special = this.settings.infectedCount + (this.settings.doctorEnabled ? 1 : 0);
        if (n >= MIN_PLAYERS && special >= n) b.push('Too many infected: at least one innocent is needed');
        return b;
    }

    warnings(): string[] {
        const w: string[] = [];
        const n = this.connectedPlayers().length;
        const inf = this.settings.infectedCount;
        if (n >= 10 && inf < 2) w.push('10+ players: we suggest 2 infected');
        if (n >= MIN_PLAYERS && inf > Math.ceil(n / 3)) w.push(`${inf} infected is a lot for ${n} players`);
        return w;
    }

    // ---------- round lifecycle ----------

    start(byId: string, now: number) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Game already started');
        const blockers = this.startBlockers();
        if (blockers.length) throw new GameError(blockers[0]);

        // Disconnected lobby players don't get a role.
        for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
        const ps = shuffle([...this.players.values()], this.rng);
        const usedBle = new Set<number>();
        ps.forEach((p, i) => {
            const role: Role =
                i < this.settings.infectedCount
                    ? 'infected'
                    : i === this.settings.infectedCount && this.settings.doctorEnabled
                        ? 'doctor'
                        : 'innocent';
            let ble = 0;
            while (!ble || usedBle.has(ble)) ble = 1 + Math.floor(this.rng() * 0xfffe);
            usedBle.add(ble);
            Object.assign(p, {
                role,
                startRole: role,
                bleId: ble,
                roleAcked: p.isBot,
                status: 'active',
                healsLeft: role === 'doctor' ? this.settings.healCharges : 0,
                immuneUntil: 0,
                bites: 0,
                heals: 0,
                timesCured: 0,
                outsideZoneSince: null,
                infectedAt: 0,
            });
        });
        this.applyTestRole();
        this.storyState = null;
        this.resetZone();
        this.events = [];
        this.feed = [];
        this.firstInfectedAt.clear();
        for (const p of this.players.values()) if (p.role === 'infected') this.firstInfectedAt.set(p.id, 0);
        this.result = null;
        this.prox.clear();
        this.debugProx.clear();
        this.holds.clear();
        this.phase = 'countdown';
        this.countdownEndsAt = now + this.settings.disperseSec * 1000;
        this.dirty = true;
        if (this.settings.disperseSec === 0) this.tick(now);
    }

    /** "Test my role": give the host the role they asked for by swapping with whoever drew it. */
    private applyTestRole() {
        const host = this.players.get(this.hostId);
        const want = this.testRole;
        if (!host || !want || !this.hasTestTools() || host.role === want) return;
        const holder = [...this.players.values()].find((p) => p.id !== host.id && p.role === want);
        const give = (p: Player, role: Role) => Object.assign(p, {
            role, startRole: role, healsLeft: role === 'doctor' ? this.settings.healCharges : 0,
        });
        const old = host.role!;
        if (holder) give(holder, old);
        else {
            // Nobody drew it (e.g. innocent with no innocents left): keep at least one infected.
            const other = [...this.players.values()].find((p) => p.id !== host.id && p.role === 'innocent')
                ?? [...this.players.values()].find((p) => p.id !== host.id && p.role !== 'infected');
            if (old === 'infected' && other) give(other, 'infected');
        }
        give(host, want);
    }

    roleAck(playerId: string) {
        const p = this.players.get(playerId);
        if (p && this.phase === 'playing') {
            p.roleAcked = true;
            this.dirty = true;
        }
    }

    playAgain(byId: string) {
        if (this.phase !== 'ended' || !this.players.get(byId)?.connected) return;
        for (const p of [...this.players.values()]) {
            if (!p.connected) {
                this.players.delete(p.id);
                continue;
            }
            Object.assign(p, { ready: p.isBot, role: null, startRole: null, status: 'active', bleId: 0 });
        }
        this.phase = 'lobby';
        this.resetZone();
        this.countdownEndsAt = this.startedAt = this.endsAt = null;
        this.result = null;
        this.dirty = true;
    }

    /** Call often (index.ts does every 100 ms). Drives countdowns, holds, timeouts, bots. */
    tick(now: number) {
        if (this.phase === 'lobby') {
            // Forget lobby players who dropped and didn't come back.
            for (const p of [...this.players.values()]) {
                if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > this.settings.reconnectSec * 1000) {
                    this.players.delete(p.id);
                    if (this.hostId === p.id) this.migrateHost();
                    this.dirty = true;
                }
            }
            if (this.players.get(this.hostId)?.ready && this.startBlockers().length === 0) {
                this.start(this.hostId, now);
            }
            return;
        }
        if (this.phase === 'playing' || this.phase === 'countdown') {
            for (const readings of this.prox.values()) {
                for (const [bleId, reading] of readings) {
                    if (now - reading.at <= PROX_STALE_MS) continue;
                    readings.delete(bleId);
                    this.dirty = true;
                }
            }
        }
        if (this.phase === 'countdown') this.stepDemoBots(now);
        if (this.phase === 'countdown' && this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
            this.phase = 'playing';
            this.startedAt = now;
            this.endsAt = now + this.settings.durationSec * 1000;
            this.zonePending = this.settings.zoneEnabled;
            this.pingAt = null;
            // Patient zero's heal window starts with the round.
            for (const p of this.players.values()) if (p.role === 'infected') p.infectedAt = now;
            this.dirty = true;
        }
        if (this.phase !== 'playing') return;

        // Reconnection window
        for (const p of this.players.values()) {
            if (
                p.status === 'active' &&
                !p.connected &&
                p.disconnectedAt !== null &&
                now - p.disconnectedAt > this.settings.reconnectSec * 1000
            ) {
                this.eliminate(p, now, 'Did not reconnect in time', 'Someone lost signal and was eliminated');
            }
        }
        if (this.phase !== 'playing') return;

        this.stepBots(now);
        this.stepDemoBots(now);
        this.stepStory(now);
        if (this.phase !== 'playing') return;
        this.stepHolds(now);
        if (this.phase !== 'playing') return;
        this.stepZone(now);
        if (this.phase !== 'playing') return;
        this.stepPing(now);

        if (this.endsAt !== null && now >= this.endsAt) {
            const survivors = this.active().filter((p) => p.role !== 'infected');
            if (survivors.length) this.end('survivors', 'Time ran out with survivors left', now);
            else this.end('infected', 'Everyone was infected', now);
        }
    }

    private active() {
        return [...this.players.values()].filter((p) => p.status === 'active');
    }

    private eliminate(p: Player, now: number, why: string, feedText = 'Someone was eliminated') {
        if (p.status === 'eliminated') return;
        p.status = 'eliminated';
        if (this.phase === 'playing') this.pushFeed('eliminated', `${feedText}… ${this.survivorsLeft(p)}`, now);
        this.cancelHoldsInvolving(p.id, 'Player left the game');
        this.prox.delete(p.id);
        this.events.push({ t: now - (this.startedAt ?? now), kind: 'eliminated', target: p.name });
        this.out.notice(p.id, { kind: 'eliminated', text: `You were eliminated. ${why}.` });
        this.dirty = true;
        this.checkVictory(now);
    }

    /** "3 survivors left" (optionally not counting `except`, who is about to leave the count). */
    private survivorsLeft(except?: Player) {
        const n = this.active().filter((p) => p.role !== 'infected' && p !== except).length;
        return n === 1 ? '1 survivor left' : `${n} survivors left`;
    }

    /** Anonymous, name-free feed line for everyone. */
    private pushFeed(kind: FeedItem['kind'], text: string, now: number) {
        const t = this.tally();
        this.feed.push({ id: ++this.feedSeq, at: now, kind, text, ...t });
        if (this.feed.length > 20) this.feed.shift();
        this.dirty = true;
    }

    /** Active infected vs active survivors (innocent + doctor). */
    tally() {
        const act = this.active();
        const infected = act.filter((p) => p.role === 'infected').length;
        return { infectedLeft: infected, survivorsLeft: act.length - infected };
    }

    /** Has this infected player been infected for HEAL_WINDOW_MS or more (cure no longer possible)? */
    infectionPermanent(p: Player, now: number) {
        return p.role === 'infected' && now - (p.infectedAt || this.startedAt || now) >= HEAL_WINDOW_MS;
    }

    private checkVictory(now: number) {
        if (this.phase !== 'playing') return;
        const act = this.active();
        const infected = act.filter((p) => p.role === 'infected');
        const uninfected = act.filter((p) => p.role !== 'infected');
        if (uninfected.length === 0) this.end('infected', 'Everyone was infected', now);
        else if (infected.length === 0) this.end('survivors', 'No infected left', now);
    }

    private end(winner: Team, reason: string, now: number) {
        if (this.phase === 'ended') return;
        this.phase = 'ended';
        this.holds.clear();
        const all = [...this.players.values()];
        this.result = {
            winner,
            reason,
            durationSec: Math.round((now - (this.startedAt ?? now)) / 1000),
            infectedTotal: this.events.filter((e) => e.kind === 'bite').length,
            curedTotal: this.events.filter((e) => e.kind === 'heal').length,
            eliminatedTotal: all.filter((p) => p.status === 'eliminated').length,
            standings: all
                .map((p) => ({
                    name: p.name,
                    icon: p.icon,
                    startRole: p.startRole!,
                    finalRole: p.role!,
                    status: p.status,
                    bites: p.bites,
                    heals: p.heals,
                    timesCured: p.timesCured,
                }))
                .sort((a, b) => rank(a) - rank(b) || b.bites - a.bites),
            events: [...this.events],
            mvps: this.mvps(all, now),
        };
        this.dirty = true;
    }

    /** Awards for the recap card. Names are fine here: the round is over and roles are public. */
    private mvps(all: Player[], now: number): Mvp[] {
        const out: Mvp[] = [];
        const roundMs = now - (this.startedAt ?? now);
        const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
        const top = (score: (p: Player) => number) =>
            all.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a))[0];
        const biter = top((p) => p.bites);
        if (biter) out.push({ title: 'Most infections', name: biter.name, detail: `${biter.bites} ${biter.bites === 1 ? 'bite' : 'bites'}` });
        const survivors = all.filter((p) => p.startRole !== 'infected');
        const lasted = (p: Player) => this.firstInfectedAt.get(p.id) ?? (p.status === 'active' ? Infinity : roundMs);
        const longest = survivors.sort((a, b) => lasted(b) - lasted(a))[0];
        if (longest) {
            const ms = lasted(longest);
            out.push({ title: 'Longest survivor', name: longest.name, detail: ms === Infinity ? 'Never infected' : `Lasted ${clock(ms)}` });
        }
        const medic = top((p) => p.heals);
        if (medic) out.push({ title: 'Best doctor', name: medic.name, detail: `${medic.heals} ${medic.heals === 1 ? 'cure' : 'cures'}` });
        const zero = all.filter((p) => p.startRole === 'infected');
        if (zero.length) out.push({ title: 'Patient zero', name: zero.map((p) => p.name).join(' & '), detail: 'Started infected' });
        return out;
    }

    // ---------- proximity ----------

    reportProx(playerId: string, readings: ProxReading[], now: number) {
        const p = this.players.get(playerId);
        if (!p?.connected || p.status !== 'active' || (this.phase !== 'playing' && this.phase !== 'countdown')) return;
        const eligible = new Set([...this.players.values()].filter(other =>
            other !== p && other.connected && other.status === 'active').map(other => other.bleId));
        let m = this.prox.get(playerId);
        if (!m) this.prox.set(playerId, (m = new Map()));
        for (const r of readings.slice(0, 100)) {
            if (!eligible.has(r?.bleId) || !['HOT', 'WARM', 'COLD'].includes(r.zone)) continue;
            const previous = m.get(r.bleId);
            if (previous?.zone !== r.zone || now - previous.at > PROX_STALE_MS) this.dirty = true;
            m.set(r.bleId, { bleId: r.bleId, zone: r.zone, rssi: Number(r.rssi) || 0, at: now });
        }
    }

    /**
     * Is A within bite/heal range of B right now? Either phone hearing the other as HOT counts,
     * because BLE is often asymmetric (one phone hears better than the other).
     */
    private proximityBetween(a: Player, b: Player, now: number): Zone | undefined {
        if (!a.connected || !b.connected) return undefined;
        const dbg = this.debugProx.get(pairKey(a.id, b.id));
        if (dbg) return dbg;
        // Demo players have no Bluetooth: their proximity comes from GPS distance.
        if (a.demo || b.demo) return this.gpsZone(a, b, now);
        const ab = this.prox.get(a.id)?.get(b.bleId);
        const ba = this.prox.get(b.id)?.get(a.bleId);
        const heard = ab && now - ab.at <= PROX_STALE_MS ? ab.zone : undefined;
        const reported = ba && now - ba.at <= PROX_STALE_MS ? ba.zone : undefined;
        if (heard === 'HOT' || reported === 'HOT') return 'HOT';
        if (heard === 'WARM' || reported === 'WARM') return 'WARM';
        return heard ?? reported;
    }

    private gpsZone(a: Player, b: Player, now: number): Zone | undefined {
        const fa = this.positions.get(a.id), fb = this.positions.get(b.id);
        if (!fa || !fb || now - fa.at > DEMO_FIX_FRESH_MS || now - fb.at > DEMO_FIX_FRESH_MS) return undefined;
        const d = distanceMeters(fa, fb);
        return d <= DEMO_HOT_M ? 'HOT' : d <= DEMO_WARM_M ? 'WARM' : d <= DEMO_COLD_M ? 'COLD' : undefined;
    }

    inRange(a: Player, b: Player, now: number): boolean {
        return this.proximityBetween(a, b, now) === 'HOT';
    }

    // ---------- bite / heal ----------

    startAction(actorId: string, targetBleId: number, now: number) {
        if (this.phase !== 'playing') throw new GameError('The round hasn’t started');
        const actor = this.players.get(actorId);
        if (!actor || actor.status !== 'active' || !actor.connected) throw new GameError('You can’t act right now');
        const target = [...this.players.values()].find((p) => p.bleId === targetBleId);
        if (!target || target.id === actor.id) throw new GameError('No player there');
        const kind = this.validate(actor, target, now);
        if (!this.inRange(actor, target, now)) throw new GameError('Too far away');
        const durationMs = kind === 'bite' ? this.settings.biteHoldMs : this.settings.healHoldMs;
        this.holds.set(actor.id, { actorId: actor.id, targetId: target.id, kind, startedAt: now, lastOkAt: now, durationMs });
        this.out.actionProgress(actor.id, { kind, targetBleId, startedAt: now, durationMs });
    }

    cancelAction(actorId: string, reason = 'Released') {
        const h = this.holds.get(actorId);
        if (!h) return;
        this.holds.delete(actorId);
        this.out.actionEnd(actorId, { kind: h.kind, ok: false, reason });
    }

    /** Throws if actor can't act on target right now; returns which action it would be. */
    private validate(actor: Player, target: Player, now: number): ActionKind {
        if (target.status !== 'active') throw new GameError('That player is out');
        if (!target.connected) throw new GameError('That player is protected (reconnecting)');
        if (actor.role === 'infected') {
            if (target.role === 'infected') throw new GameError('They’re already infected');
            if (target.immuneUntil > now) throw new GameError('They’re immune for a few seconds');
            return 'bite';
        }
        if (actor.role === 'doctor') {
            if (actor.healsLeft <= 0) throw new GameError('No heals left');
            if (target.role !== 'infected') throw new GameError('Heal had no effect');
            if (this.infectionPermanent(target, now)) throw new GameError('Too late: that infection is permanent');
            return 'heal';
        }
        throw new GameError('Innocents can’t bite or heal');
    }

    private cancelHoldsInvolving(playerId: string, reason: string) {
        for (const h of [...this.holds.values()]) {
            if (h.actorId === playerId || h.targetId === playerId) this.cancelAction(h.actorId, reason);
        }
    }

    private stepHolds(now: number) {
        // Complete in start order, so if a doctor and an infected race on the same person,
        // whoever started first finishes first and the other re-validates against the new state.
        const holds = [...this.holds.values()].sort((a, b) => a.startedAt - b.startedAt);
        for (const h of holds) {
            if (this.phase !== 'playing') return;
            if (this.holds.get(h.actorId) !== h) continue;
            const actor = this.players.get(h.actorId)!;
            const target = this.players.get(h.targetId);
            if (!target) {
                this.cancelAction(h.actorId, 'Player left');
                continue;
            }
            if (this.inRange(actor, target, now)) h.lastOkAt = now;
            else if (now - h.lastOkAt > PROX_GRACE_MS) {
                this.cancelAction(h.actorId, 'Moved out of range');
                continue;
            }
            if (now - h.startedAt < h.durationMs) continue;

            this.holds.delete(h.actorId);
            let kind: ActionKind;
            try {
                kind = this.validate(actor, target, now);
            } catch (e) {
                this.out.actionEnd(actor.id, { kind: h.kind, ok: false, reason: (e as Error).message });
                continue;
            }
            if (kind !== h.kind) {
                this.out.actionEnd(actor.id, { kind: h.kind, ok: false, reason: 'Something changed' });
                continue;
            }
            if (kind === 'bite') this.applyBite(actor, target, now);
            else this.applyHeal(actor, target, now);
        }
    }

    private applyBite(actor: Player, target: Player, now: number) {
        const wasDoctor = target.role === 'doctor';
        target.role = 'infected';
        // No role card mid-round: the bitten player stays on the map (the app shows a toast).
        target.roleAcked = true;
        target.infectedAt = now;
        actor.bites++;
        this.addMark(target, actor, now);
        if (!this.firstInfectedAt.has(target.id)) this.firstInfectedAt.set(target.id, now - (this.startedAt ?? now));
        this.pushFeed('infected', `Someone was infected… ${this.survivorsLeft()}`, now);
        this.cancelAction(target.id, 'You were infected');
        this.events.push({ t: now - (this.startedAt ?? now), kind: 'bite', actor: actor.name, target: target.name });
        this.out.actionEnd(actor.id, { kind: 'bite', ok: true });
        this.out.notice(actor.id, { kind: 'biteLanded', text: 'Infection landed! They’re one of you now.' });
        this.out.notice(target.id, { kind: 'youWereInfected', text: 'You’ve been infected. You are INFECTED.' });
        this.dirty = true;
        if (wasDoctor) this.end('infected', 'The doctor was infected', now);
        else this.checkVictory(now);
    }

    /** Drop an anonymous, fuzzed marker near where the bite happened. */
    private addMark(target: Player, actor: Player, now: number) {
        const f = this.fix(target.id, now) ?? this.fix(actor.id, now);
        if (!f) return;
        const [lo, hi] = MARK_FUZZ_M;
        const at = offsetMeters(f, lo + this.rng() * (hi - lo), this.rng() * 360);
        this.marks.push({ id: ++this.markSeq, lat: at.lat, lng: at.lng, at: now });
        this.marks = this.marks.filter((m) => now - m.at < INFECTION_MARK_MS).slice(-20);
    }

    private applyHeal(actor: Player, target: Player, now: number) {
        target.role = 'innocent';
        target.infectedAt = 0;
        target.roleAcked = target.isBot;
        target.immuneUntil = now + this.settings.immunitySec * 1000;
        target.timesCured++;
        actor.healsLeft--;
        actor.heals++;
        this.pushFeed('cured', `Someone was cured. ${this.survivorsLeft()[0].toUpperCase()}${this.survivorsLeft().slice(1)}`, now);
        this.cancelAction(target.id, 'You were cured');
        this.events.push({ t: now - (this.startedAt ?? now), kind: 'heal', actor: actor.name, target: target.name });
        this.out.actionEnd(actor.id, { kind: 'heal', ok: true });
        this.out.notice(actor.id, { kind: 'healLanded', text: `Cured! ${actor.healsLeft} heal(s) left.` });
        this.out.notice(target.id, {
            kind: 'youWereCured',
            text: `You’ve been cured. Immune for ${this.settings.immunitySec}s.`,
        });
        this.dirty = true;
        this.checkVictory(now);
    }

    // ---------- debug ----------

    private requireDebug() {
        if (!this.debugEnabled) throw new GameError('Debug is off on this server');
    }

    addBots(count: number, now: number) {
        this.requireDebug();
        if (this.phase !== 'lobby') throw new GameError('Add bots in the lobby');
        const n = Math.max(1, Math.min(10, count | 0));
        for (let i = 0; i < n; i++) {
            const id = `bot-${Math.floor(this.rng() * 1e9)}`;
            this.join(id, 'Bot', now, true);
        }
    }

    /** Host-only, always available (not a debug tool): 3 simulated people who walk around near the host. */
    addDemoPlayers(byId: string, now: number) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Add demo players in the lobby');
        const room = this.settings.maxPlayers - this.players.size;
        if (room <= 0) throw new GameError('Room is full');
        for (const name of DEMO_NAMES.slice(0, room)) {
            const p = this.join(`demo-${Math.floor(this.rng() * 1e9)}`, name, now, true);
            p.demo = true;
        }
    }

    setDebugProx(playerId: string, targetBleId: number, zone: Zone | null) {
        this.requireDebug();
        const target = [...this.players.values()].find((p) => p.bleId === targetBleId);
        if (!target) return;
        const k = pairKey(playerId, target.id);
        if (zone) this.debugProx.set(k, zone);
        else this.debugProx.delete(k);
        this.dirty = true;
    }

    debugSkip(now: number) {
        this.requireDebug();
        if (this.phase === 'countdown') this.countdownEndsAt = now;
        else if (this.phase === 'playing') this.endsAt = Math.min(this.endsAt ?? now, now + 5000);
        this.dirty = true;
        this.tick(now);
    }

    /** Test tools (Test my role, switch role) are for demo rooms, so real games stay fair. */
    hasTestTools() {
        return this.hasDemo();
    }

    setStory(byId: string, on: boolean) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Turn Story mode on in the lobby');
        if (on && !this.hasTestTools()) throw new GameError('Story mode is only for rooms with demo players');
        this.story = !!on;
        this.dirty = true;
    }

    setTestRole(byId: string, role: Role | null) {
        this.requireHost(byId);
        if (this.phase !== 'lobby') throw new GameError('Pick your test role in the lobby');
        if (!this.hasTestTools()) throw new GameError('Test roles are only for rooms with demo players');
        if (role !== null && !['infected', 'innocent', 'doctor'].includes(role)) throw new GameError('Unknown role');
        if (role === 'doctor' && !this.settings.doctorEnabled) throw new GameError('Turn the doctor on first');
        this.testRole = role;
        this.dirty = true;
    }

    debugSetRole(playerId: string, role: Role, now = Date.now()) {
        if (!this.hasTestTools()) this.requireDebug();
        const p = this.players.get(playerId);
        if (!p || this.phase !== 'playing') return;
        if (!['infected', 'innocent', 'doctor'].includes(role) || p.role === role || p.status !== 'active') return;
        // Trade roles with a demo/bot player who has the one you want, so the round keeps its
        // infected and doctor (switching the last infected to innocent would otherwise end it).
        const old = p.role;
        const partner = this.active().find((o) => o !== p && o.isBot && o.role === role);
        const setRole = (who: Player, r: Role) => {
            who.role = r;
            who.infectedAt = r === 'infected' ? now : 0;
            if (r === 'doctor' && who.healsLeft === 0) who.healsLeft = this.settings.healCharges;
            this.cancelHoldsInvolving(who.id, 'Role changed');
        };
        if (partner && old) setRole(partner, old);
        setRole(p, role);
        p.roleAcked = true; // a test switch skips the "your secret role" card
        this.dirty = true;
        this.checkVictory(now);
    }

    /** Bots move around randomly and bite/heal whoever is HOT, so one phone can play a round. */
    private stepBots(now: number) {
        const bots = this.active().filter((p) => p.isBot && !p.demo);
        if (!bots.length) return;
        if (this.botRoam && now - this.lastBotStep > 3000) {
            this.lastBotStep = now;
            const others = this.active();
            for (const b of bots)
                for (const o of others) {
                    if (o.id === b.id) continue;
                    const r = this.rng();
                    this.debugProx.set(pairKey(b.id, o.id), r < 0.2 ? 'HOT' : r < 0.55 ? 'WARM' : 'COLD');
                }
            this.dirty = true;
        }
        for (const b of bots) {
            if (this.holds.has(b.id) || !b.connected) continue;
            for (const t of this.active()) {
                if (t.id === b.id || !this.inRange(b, t, now)) continue;
                try {
                    this.validate(b, t, now);
                    this.startAction(b.id, t.bleId, now);
                    break;
                } catch {
                    /* not a valid target */
                }
            }
        }
    }

    // ---------- demo players ----------

    /**
     * Walks every demo player one GPS step (~1 Hz) and lets them act like a person:
     * infected drift toward the nearest survivor and bite after staying HOT; survivors wander and
     * back off from a nearby infected; a doctor walks up to a nearby infected and heals.
     * Every bite/heal goes through startAction, so hold time, immunity and all rules apply.
     */
    private stepDemoBots(now: number) {
        const bots = this.active().filter((p) => p.demo && p.connected);
        if (!bots.length) return;
        if (this.lastDemoStep && now - this.lastDemoStep < DEMO_STEP_MS) return;
        const dt = this.lastDemoStep ? Math.min(2, (now - this.lastDemoStep) / 1000) : 1;
        this.lastDemoStep = now;
        const scripted = this.storyOn() ? new Set([this.storyActors().zombie, this.storyActors().doctor]) : new Set();
        for (const b of bots) {
            const s = this.demoBots.get(b.id);
            if (!s) this.spawnDemoBot(b, now);
            else if (scripted.has(b)) this.positions.set(b.id, { ...s.pos, at: now }); // the story moves them
            else this.walkDemoBot(b, s, dt, now);
        }
        // Story mode: the script decides who bites and heals, nobody acts on their own.
        if (this.phase === 'playing' && !this.storyOn()) for (const b of bots) this.demoAct(b, now);
        this.dirty = true;
    }

    // ---------- story mode (scripted demo) ----------

    private storyOn() {
        return this.story && this.hasTestTools() && this.phase === 'playing';
    }

    /** Demo players the story moves itself (they don't wander). */
    private storyActors(): { zombie?: Player; doctor?: Player; host?: Player } {
        const host = this.players.get(this.hostId);
        const bots = this.active().filter((p) => p.demo);
        const zombie = bots.find((p) => p.startRole === 'infected');
        const doctor = bots.find((p) => p.startRole === 'doctor');
        return { zombie, doctor, host };
    }

    /**
     * The storyline, timed from round start (see STORY_* below). Moves are simulated GPS; bites and
     * cures go through applyBite/applyHeal, so banners, markers, notices and victory are the real ones.
     */
    private stepStory(now: number) {
        if (!this.storyOn() || this.startedAt === null) return;
        const { zombie, doctor, host } = this.storyActors();
        const at = host && this.fix(host.id, now);
        if (!host || !at || host.status !== 'active') return;
        const st = (this.storyState ??= { bitAt: null, curedHostAt: null, from: new Map() });
        const t = now - this.startedAt;
        /** Walk `who` from where it was at `t0` to `meters` from the host, arriving at `t1`. */
        const approach = (who: Player | undefined, t0: number, t1: number, meters: number) => {
            if (!who || who.status !== 'active' || t < t0) return;
            const key = `${who.id}@${t0}`;
            if (!st.from.has(key)) st.from.set(key, { ...(this.positions.get(who.id) ?? offsetMeters(at, 40, 200)) });
            const from = st.from.get(key)!;
            const end = offsetMeters(at, meters, bearingDeg(at, from));
            const k = Math.min(1, (t - t0) / Math.max(1, t1 - t0));
            const pos = { lat: from.lat + (end.lat - from.lat) * k, lng: from.lng + (end.lng - from.lng) * k };
            this.positions.set(who.id, { ...pos, at: now });
            const s = this.demoBots.get(who.id);
            if (s) s.pos = pos;
        };
        const hostRole = host.startRole;
        if (hostRole === 'doctor') {
            // An infected walks up from 10 s, then stays ~2 m away (HOT) without biting until cured.
            // Its 60 s heal window starts when it sets off, so the doctor has until ~70 s to cure it.
            if (zombie?.role === 'infected') {
                if (t >= STORY_DOCTOR_APPROACH_MS && !st.from.has('doctor-window')) {
                    st.from.set('doctor-window', at);
                    zombie.infectedAt = now;
                }
                approach(zombie, STORY_DOCTOR_APPROACH_MS, STORY_DOCTOR_APPROACH_MS + 8000, 2);
            }
            return;
        }
        if (hostRole !== 'innocent' || !zombie) return;
        // 1. The zombie walks up and bites the host at 20 s.
        if (st.bitAt === null) {
            approach(zombie, 0, STORY_BITE_MS - 1000, 1);
            if (t >= STORY_BITE_MS && host.role !== 'infected' && zombie.role === 'infected') {
                this.applyBite(zombie, host, now);
                st.bitAt = now;
                zombie.bites = Math.max(1, zombie.bites);
            }
            return;
        }
        if (!doctor || doctor.status !== 'active') return;
        const sinceBite = now - st.bitAt;
        // 2. The doctor walks over and cures the host 20 s after the bite.
        if (st.curedHostAt === null) {
            approach(doctor, st.bitAt - this.startedAt + 5000, st.bitAt - this.startedAt + STORY_CURE_HOST_AFTER_MS - 1000, 1.5);
            if (sinceBite >= STORY_CURE_HOST_AFTER_MS && host.role === 'infected') {
                this.applyHeal(doctor, host, now);
                st.curedHostAt = now;
            }
            return;
        }
        // 3. 10 s later the doctor cures the last zombie: no infected left, survivors win.
        approach(doctor, st.curedHostAt - this.startedAt + 1000, st.curedHostAt - this.startedAt + STORY_CURE_ZOMBIE_AFTER_MS - 1000, 1.5);
        approach(zombie, st.curedHostAt - this.startedAt + 1000, st.curedHostAt - this.startedAt + STORY_CURE_ZOMBIE_AFTER_MS - 1000, 6);
        if (now - st.curedHostAt >= STORY_CURE_ZOMBIE_AFTER_MS && zombie.role === 'infected' && doctor.healsLeft > 0) {
            this.applyHeal(doctor, zombie, now);
        }
    }

    private spawnDemoBot(b: Player, now: number) {
        // Around the host's real position, or any real player's if the host has no fix yet.
        const real = [this.hostId, ...[...this.players.values()].filter((p) => !p.isBot).map((p) => p.id)];
        const anchor = real.map((id) => this.fix(id, now)).find((f) => !!f);
        if (!anchor) return; // wait for someone's GPS
        const [lo, hi] = DEMO_SPAWN_M;
        const pos = offsetMeters(anchor, lo + this.rng() * (hi - lo), this.rng() * 360);
        const [w0, w1] = DEMO_WALK_MPS;
        this.demoBots.set(b.id, {
            pos,
            anchor: { lat: anchor.lat, lng: anchor.lng },
            heading: this.rng() * 360,
            turn: 0,
            pace: w0 + this.rng() * (w1 - w0),
            pauseUntil: 0,
            hotTargetId: null,
            hotSince: 0,
        });
        this.positions.set(b.id, { ...pos, at: now });
    }

    /** Nearest active player (other than b) with a fresh fix that passes `ok`. */
    private nearest(b: Player, from: LatLng, now: number, ok: (p: Player) => boolean) {
        let best: { p: Player; at: LatLng; d: number } | null = null;
        for (const p of this.active()) {
            if (p.id === b.id || !p.connected || !ok(p)) continue;
            const f = this.positions.get(p.id);
            if (!f || now - f.at > DEMO_FIX_FRESH_MS) continue;
            const d = distanceMeters(from, f);
            if (!best || d < best.d) best = { p, at: f, d };
        }
        return best;
    }

    private walkDemoBot(b: Player, s: DemoBot, dt: number, now: number) {
        let desired: number;
        let speed = s.pace;
        /** don't walk closer than this to the thing we approach */
        let stopShortM = 0;
        let maxStep = Infinity;
        const playing = this.phase === 'playing';
        // Infected go for real people first (that's who the demo is for), then other demo players.
        const biteable = (p: Player) => p.role !== 'infected' && p.immuneUntil <= now;
        const prey = playing && b.role === 'infected'
            ? this.nearest(b, s.pos, now, (p) => !p.isBot && biteable(p)) ?? this.nearest(b, s.pos, now, biteable) : null;
        const patient = playing && b.role === 'doctor' && b.healsLeft > 0
            ? this.nearest(b, s.pos, now, (p) => p.role === 'infected') : null;
        const threat = playing && b.role !== 'infected'
            ? this.nearest(b, s.pos, now, (p) => p.role === 'infected') : null;
        if (prey) {
            desired = bearingDeg(s.pos, prey.at);
            speed = DEMO_CHASE_MPS;
            stopShortM = 1;
            maxStep = Math.max(0, prey.d - stopShortM);
        } else if (patient && patient.d <= DEMO_WARM_M) {
            desired = bearingDeg(s.pos, patient.at);
            speed = DEMO_CHASE_MPS;
            maxStep = Math.max(0, patient.d - 1.5);
        } else if (threat && threat.d <= DEMO_WARM_M) {
            desired = bearingDeg(threat.at, s.pos); // walk away
            speed = DEMO_MAX_MPS;
        } else {
            // Wander: a smoothly drifting turn rate and the odd short pause.
            s.turn = Math.max(-25, Math.min(25, s.turn + (this.rng() - 0.5) * 30 * dt));
            desired = s.heading + s.turn * dt;
            if (now < s.pauseUntil) speed = 0;
            else if (this.rng() < 0.04 * dt) {
                s.pauseUntil = now + 2000 + this.rng() * 3000;
                speed = 0;
            }
        }
        // Stay inside the safe zone (or near spawn before it exists): head back toward the middle.
        const area = this.zone ? { c: this.zone.center, r: this.zone.radiusM - DEMO_EDGE_MARGIN_M } : { c: s.anchor, r: DEMO_LEASH_M };
        const fromCenter = distanceMeters(s.pos, area.c);
        if (fromCenter > Math.max(2, area.r)) {
            desired = bearingDeg(s.pos, area.c);
            speed = Math.max(speed, s.pace);
            maxStep = Infinity;
            s.pauseUntil = 0;
        }
        // Turn smoothly toward where we want to go.
        const delta = ((desired - s.heading + 540) % 360) - 180;
        const maxTurn = DEMO_TURN_DEG_PER_S * dt;
        s.heading = (s.heading + Math.max(-maxTurn, Math.min(maxTurn, delta)) + 360) % 360;
        // Mostly-backwards targets: slow down while turning around, like a person would.
        const facing = Math.cos((Math.min(180, Math.abs(delta) - Math.min(Math.abs(delta), maxTurn)) * Math.PI) / 180);
        const step = Math.min(Math.min(speed, DEMO_MAX_MPS) * dt * Math.max(0.3, facing), maxStep);
        if (step > 0.01) s.pos = offsetMeters(s.pos, step, s.heading);
        this.positions.set(b.id, { ...s.pos, at: now });
    }

    /** Start a bite/heal through the normal rules once the bot has been HOT on a valid target long enough. */
    private demoAct(b: Player, now: number) {
        const s = this.demoBots.get(b.id);
        if (!s || this.holds.has(b.id) || b.status !== 'active') return;
        let target: Player | null = null;
        for (const t of this.active()) {
            if (t.id === b.id || !this.inRange(b, t, now)) continue;
            try {
                this.validate(b, t, now);
                target = t;
                if (t.id === s.hotTargetId) break;
            } catch { /* not a valid target */ }
        }
        if (!target) {
            s.hotTargetId = null;
            return;
        }
        if (target.id !== s.hotTargetId) {
            s.hotTargetId = target.id;
            s.hotSince = now;
            return;
        }
        const wait = b.role === 'doctor' ? DEMO_HEAL_AFTER_MS : DEMO_BITE_AFTER_MS;
        if (now - s.hotSince < wait) return;
        try {
            this.startAction(b.id, target.bleId, now);
            s.hotTargetId = null;
        } catch { /* rules said no; try again next step */ }
    }

    // ---------- location, safe zone, pings ----------

    reportLoc(playerId: string, loc: { lat?: unknown; lng?: unknown; acc?: unknown }, now: number) {
        const p = this.players.get(playerId);
        if (!p || p.status !== 'active' || (this.phase !== 'playing' && this.phase !== 'countdown')) return;
        const lat = Number(loc?.lat), lng = Number(loc?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        if (lat === 0 && lng === 0) return; // "null island": a broken fix, not a real place
        const acc = loc?.acc === undefined ? 0 : Number(loc.acc);
        if (!Number.isFinite(acc) || acc < 0 || acc > 500) return; // too vague to judge zone edges
        this.positions.set(playerId, { lat, lng, at: now });
        // Live ally pins change for infected viewers.
        if (p.role === 'infected') this.dirty = true;
    }

    private fix(playerId: string, now: number) {
        const f = this.positions.get(playerId);
        return f && now - f.at <= LOC_STALE_MS ? f : null;
    }

    private resetZone() {
        this.positions.clear();
        this.zone = null;
        this.zonePending = false;
        this.pings.clear();
        this.pingAt = null;
        this.pingSampledAt = null;
        this.pingQueue = [];
        this.lastPingSample = null;
        this.marks = [];
        this.demoBots.clear();
        this.lastDemoStep = 0;
        for (const p of this.players.values()) p.outsideZoneSince = null;
    }

    private placeZone(now: number) {
        const fixes = this.active().map((p) => this.fix(p.id, now)).filter((f): f is LatLng & { at: number } => !!f);
        let center: LatLng | null = null;
        if (fixes.length) {
            center = {
                lat: fixes.reduce((a, f) => a + f.lat, 0) / fixes.length,
                lng: fixes.reduce((a, f) => a + f.lng, 0) / fixes.length,
            };
        } else {
            const h = this.fix(this.hostId, now);
            if (h) center = { lat: h.lat, lng: h.lng };
        }
        if (!center) return false;
        const r = this.settings.zoneStartRadiusM;
        this.zone = {
            center,
            radiusM: r,
            nextRadiusM: Math.max(ZONE_MIN_RADIUS_M, Math.round(r * ZONE_SHRINK_FACTOR)),
            shrinksAt: now + this.settings.zoneShrinkSec * 1000,
            warnedFor: null,
        };
        // Debug bots get a spot inside the zone so pings and the map have something to show.
        if (this.debugEnabled) {
            for (const b of this.active().filter((p) => p.isBot && !p.demo)) {
                this.positions.set(b.id, { ...offsetMeters(center, this.rng() * r * 0.6, this.rng() * 360), at: now });
            }
        }
        this.dirty = true;
        return true;
    }

    private stepZone(now: number) {
        if (this.zonePending) {
            if (this.placeZone(now)) this.zonePending = false;
            else if (now - (this.startedAt ?? now) >= ZONE_FIX_WAIT_MS) {
                this.zonePending = false;
                for (const p of this.players.values())
                    this.out.notice(p.id, { kind: 'info', text: 'No GPS from anyone, so the safe zone is off this round.' });
            }
        }
        const z = this.zone;
        if (!z) return;
        // keep debug bots' fixes fresh
        if (this.debugEnabled) for (const b of this.active().filter((p) => p.isBot)) {
            const f = this.positions.get(b.id);
            if (f) f.at = now;
        }
        if (z.shrinksAt !== null) {
            if (z.warnedFor !== z.shrinksAt && z.shrinksAt - now <= ZONE_WARNING_MS) {
                z.warnedFor = z.shrinksAt;
                for (const p of this.active()) this.out.notice(p.id, { kind: 'info', text: `The safe zone shrinks in ${ZONE_WARNING_MS / 1000} seconds!` });
                this.dirty = true;
            }
            if (now >= z.shrinksAt) {
                z.radiusM = z.nextRadiusM ?? z.radiusM;
                const next = Math.max(ZONE_MIN_RADIUS_M, Math.round(z.radiusM * ZONE_SHRINK_FACTOR));
                z.nextRadiusM = z.radiusM > ZONE_MIN_RADIUS_M ? next : null;
                z.shrinksAt = z.nextRadiusM !== null ? now + this.settings.zoneShrinkSec * 1000 : null;
                this.dirty = true;
            }
        }
        const graceMs = this.settings.zoneGraceSec * 1000;
        for (const p of this.active()) {
            if (p.isBot) continue; // debug bots have made-up positions
            const f = this.fix(p.id, now);
            if (!f) continue; // no fresh fix: unknown, never punished
            const outside = distanceMeters(f, z.center) > z.radiusM;
            if (outside && p.outsideZoneSince === null) {
                p.outsideZoneSince = now;
                this.out.notice(p.id, { kind: 'info', text: `You left the safe zone! Get back in within ${this.settings.zoneGraceSec}s.` });
                this.dirty = true;
            } else if (!outside && p.outsideZoneSince !== null) {
                p.outsideZoneSince = null;
                this.dirty = true;
            } else if (outside && p.outsideZoneSince !== null && now - p.outsideZoneSince >= graceMs) {
                p.outsideZoneSince = null;
                this.eliminate(p, now, 'You stayed outside the safe zone', 'Someone left the zone and was eliminated');
                if (this.phase !== 'playing') return;
            }
        }
    }

    /** Rooms with demo players ping faster so the demo shows movement. */
    pingEveryMs() {
        return this.hasDemo() ? DEMO_PING_INTERVAL_MS : PING_INTERVAL_MS;
    }

    pingDelayMs() {
        return this.hasDemo() ? DEMO_PING_DELAY_MS : PING_DELAY_MS;
    }

    private hasDemo() {
        return [...this.players.values()].some((p) => p.demo);
    }

    /**
     * Every interval, sample every active player's position fuzzed 20-40 m. A sample is held back
     * for the ping delay and only then released, so infected only ever see where survivors WERE.
     * Exact positions never leave the server.
     */
    private stepPing(now: number) {
        const every = this.pingEveryMs();
        const since = this.lastPingSample ?? this.startedAt ?? now;
        if (now - since >= every) {
            this.lastPingSample = now;
            const dots = new Map<string, LatLng>();
            for (const p of this.active()) {
                const f = this.fix(p.id, now);
                if (!f) continue;
                const [lo, hi] = PING_FUZZ_M;
                dots.set(p.id, offsetMeters(f, lo + this.rng() * (hi - lo), this.rng() * 360));
            }
            this.pingQueue.push({ at: now, dots });
        }
        const delay = this.pingDelayMs();
        while (this.pingQueue.length && now - this.pingQueue[0].at >= delay) {
            const next = this.pingQueue.shift()!;
            this.pings = next.dots;
            this.pingSampledAt = next.at;
            this.pingAt = now;
            this.dirty = true;
        }
    }

    // ---------- views ----------

    /**
     * Survivors only: the closest proximity bucket to ANY active infected player (BLE, or GPS for
     * demo players). Says how close danger is, never who. Infected players always get null.
     */
    dangerFor(me: Player, now: number): Zone | null {
        if (this.phase !== 'playing' || me.status !== 'active' || me.role === null || me.role === 'infected') return null;
        let best: Zone | null = null;
        const rank = { HOT: 3, WARM: 2, COLD: 1 } as const;
        for (const p of this.active()) {
            if (p === me || p.role !== 'infected') continue;
            const z = this.proximityBetween(me, p, now);
            if (z && (!best || rank[z] > rank[best])) best = z;
        }
        return best;
    }

    /**
     * Survivors only: 0..1 closeness of the nearest infected (1 = touching), for a heartbeat that
     * gets harder and faster the closer they are. GPS distance for demo players, else RSSI, else
     * the proximity bucket. Rounded to 0.05 so it can't be used to pinpoint anyone. COLD = none.
     */
    dangerLevelFor(me: Player, now: number): number | null {
        if (this.phase !== 'playing' || me.status !== 'active' || me.role === null || me.role === 'infected') return null;
        let best = 0;
        for (const p of this.active()) {
            if (p === me || p.role !== 'infected') continue;
            const zone = this.proximityBetween(me, p, now);
            if (zone !== 'HOT' && zone !== 'WARM') continue;
            best = Math.max(best, this.closeness(me, p, zone, now));
        }
        return best > 0 ? Math.round(best * 20) / 20 : null;
    }

    private closeness(a: Player, b: Player, zone: 'HOT' | 'WARM', now: number): number {
        // WARM spans 0.05..0.5, HOT spans 0.55..1.
        const [lo, hi] = zone === 'HOT' ? [0.55, 1] : [0.05, 0.5];
        const within = (t: number) => lo + (hi - lo) * Math.max(0, Math.min(1, t));
        if (!this.debugProx.get(pairKey(a.id, b.id)) && (a.demo || b.demo)) {
            const fa = this.positions.get(a.id), fb = this.positions.get(b.id);
            if (fa && fb) {
                const d = distanceMeters(fa, fb);
                return zone === 'HOT'
                    ? within(1 - d / DEMO_HOT_M)
                    : within(1 - (d - DEMO_HOT_M) / (DEMO_WARM_M - DEMO_HOT_M));
            }
        }
        const ab = this.prox.get(a.id)?.get(b.bleId), ba = this.prox.get(b.id)?.get(a.bleId);
        const rssis = [ab, ba].filter((r) => r && now - r.at <= PROX_STALE_MS && r.rssi < 0).map((r) => r!.rssi);
        if (rssis.length) {
            const rssi = Math.max(...rssis);
            // roughly -85 dBm (edge of WARM) .. -45 dBm (phones touching)
            return zone === 'HOT' ? within((rssi + 65) / 20) : within((rssi + 85) / 20);
        }
        return within(0.5);
    }

    private zoneView(now: number): ZoneView {
        const z = this.zone!;
        return {
            center: z.center,
            radiusM: z.radiusM,
            nextRadiusM: z.nextRadiusM,
            shrinksAt: z.shrinksAt,
            warning: z.shrinksAt !== null && z.shrinksAt - now <= ZONE_WARNING_MS,
        };
    }

    /** Fellow infected positions: only for an active infected viewer during play. */
    private alliesFor(me: Player | undefined, now: number): AllyPos[] {
        if (!me || this.phase !== 'playing' || me.role !== 'infected' || me.status !== 'active') return [];
        const out: AllyPos[] = [];
        for (const p of this.active()) {
            if (p.id === me.id || p.role !== 'infected') continue;
            const f = this.fix(p.id, now);
            if (f) out.push({ id: p.id, name: p.name, icon: p.icon, lat: f.lat, lng: f.lng });
        }
        return out;
    }

    /**
     * Role-based map. Innocents and the doctor see nobody else (no pings, no pins).
     * Infected see fellow infected live (alliesFor) and survivors only as the delayed, fuzzed ping.
     * Uses the viewer's role right now, so a bite or a cure switches the map at once.
     */
    private pingsVisibleTo(me: Player | undefined) {
        return !!me && this.phase === 'playing' && me.status === 'active' && me.role === 'infected';
    }

    private pingsFor(me: Player | undefined): PingDot[] {
        if (!this.pingsVisibleTo(me) || this.pingSampledAt === null) return [];
        const out: PingDot[] = [];
        for (const [id, l] of this.pings) {
            const p = this.players.get(id);
            // Only survivors are pinged: allies are already shown live.
            if (id === me!.id || p?.status !== 'active' || p.role === 'infected') continue;
            out.push({ lat: l.lat, lng: l.lng, at: this.pingSampledAt, icon: p.icon });
        }
        return out;
    }

    private marksFor(now: number): InfectionMark[] {
        if (this.phase !== 'playing') return [];
        return this.marks.filter((m) => now - m.at < INFECTION_MARK_MS).map((m) => ({ ...m }));
    }

    viewFor(playerId: string, now: number): RoomView {
        const me = this.players.get(playerId);
        const inGame = this.phase !== 'lobby';
        const roleVisible = this.phase === 'playing' || this.phase === 'ended';
        const radar: RadarEntry[] = [];
        const debugProx: Record<number, Zone> = {};
        if (me && inGame && me.status === 'active') {
            for (const p of this.players.values()) {
                if (p.id === me.id || p.status !== 'active') continue;
                const ally = roleVisible && me.role === 'infected' && p.role === 'infected';
                const zone = this.proximityBetween(me, p, now);
                const entry: RadarEntry = ally ? { bleId: p.bleId, zone, ally, name: p.name } : { bleId: p.bleId, zone, ally };
                if (me.role === 'doctor' && this.phase === 'playing' && this.infectionPermanent(p, now)) entry.noHeal = true;
                radar.push(entry);
                const z = this.debugProx.get(pairKey(me.id, p.id));
                if (z) debugProx[p.bleId] = z;
            }
        }
        return {
            code: this.code,
            phase: this.phase,
            serverNow: now,
            youId: playerId,
            hostId: this.hostId,
            players: [...this.players.values()].map((p) => ({
                id: p.id,
                name: p.name,
                icon: p.icon,
                isHost: p.id === this.hostId,
                isBot: p.isBot,
                isDemo: !!p.demo,
                ready: p.ready,
                connected: p.connected,
                status: p.status,
            })),
            settings: this.settings,
            settingsVersion: this.settingsVersion,
            changedKeys: this.changedKeys,
            canStart: this.phase === 'lobby' && this.startBlockers().length === 0,
            startBlockers: this.phase === 'lobby' ? this.startBlockers() : [],
            warnings: this.phase === 'lobby' ? this.warnings() : [],
            countdownEndsAt: this.countdownEndsAt,
            endsAt: this.endsAt,
            me:
                me && inGame
                    ? {
                        bleId: me.bleId,
                        role: roleVisible ? me.role : null,
                        roleAcked: me.roleAcked,
                        healsLeft: me.healsLeft,
                        immuneUntil: me.immuneUntil,
                        status: me.status,
                        outsideZoneSince: me.outsideZoneSince,
                        danger: this.dangerFor(me, now),
                        dangerLevel: this.dangerLevelFor(me, now),
                        graceEndsAt:
                            me.outsideZoneSince !== null ? me.outsideZoneSince + this.settings.zoneGraceSec * 1000 : null,
                    }
                    : null,
            radar: radar.sort((a, b) => a.bleId - b.bleId),
            debugProx,
            debugEnabled: this.debugEnabled,
            result: this.result,
            zone: this.phase === 'playing' && this.zone ? this.zoneView(now) : null,
            allies: this.alliesFor(me, now),
            pings: this.pingsFor(me),
            pingAt: this.pingsVisibleTo(me) ? this.pingAt : null,
            infectionMarks: this.marksFor(now),
            tally: this.phase === 'playing' ? this.tally() : null,
            pingEveryMs: this.pingEveryMs(),
            testTools: this.hasTestTools(),
            ...(playerId === this.hostId && this.hasTestTools() ? { story: this.story } : {}),
            ...(playerId === this.hostId && this.hasTestTools() ? { testRole: this.testRole } : {}),
            feed: inGame ? this.feed.slice(-5) : [],
        };
    }
}

function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function rank(s: { status: PlayerStatus; finalRole: Role }) {
    if (s.status === 'eliminated') return 2;
    return s.finalRole === 'infected' ? 1 : 0;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export { makeRoomCode } from '../../shared/roomCode';

const EARTH_R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing (0 = north, clockwise) from a to b, in degrees. */
export function bearingDeg(a: LatLng, b: LatLng): number {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The point `meters` away from `from` in compass direction `bearingDeg`. */
export function offsetMeters(from: LatLng, meters: number, bearingDeg: number): LatLng {
    const d = meters / EARTH_R;
    const br = rad(bearingDeg);
    const lat1 = rad(from.lat);
    const lng1 = rad(from.lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
    const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
