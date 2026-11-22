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
} from '../../shared/protocol';

export class GameError extends Error { }

/** A bite/heal hold may survive a brief signal dropout of this length. */
export const PROX_GRACE_MS = 700;
/** A proximity reading older than this doesn't count. */
export const PROX_STALE_MS = 2000;

export interface Player {
    id: string;
    name: string;
    isBot: boolean;
    connected: boolean;
    joinedAt: number;
    disconnectedAt: number | null;
    ready: boolean;
    // game
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
    join(playerId: string, rawName: string, now: number, isBot = false): Player {
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
        };
        this.players.set(playerId, p);
        if (!this.hostId) this.hostId = playerId;
        this.dirty = true;
        return p;
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
            this.eliminate(p, now, 'Left the game');
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
            });
        });
        this.events = [];
        this.result = null;
        this.prox.clear();
        this.debugProx.clear();
        this.holds.clear();
        this.phase = 'countdown';
        this.countdownEndsAt = now + this.settings.disperseSec * 1000;
        this.dirty = true;
        if (this.settings.disperseSec === 0) this.tick(now);
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
        if (this.phase === 'countdown' && this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
            this.phase = 'playing';
            this.startedAt = now;
            this.endsAt = now + this.settings.durationSec * 1000;
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
                this.eliminate(p, now, 'Did not reconnect in time');
            }
        }
        if (this.phase !== 'playing') return;

        this.stepBots(now);
        this.stepHolds(now);
        if (this.phase !== 'playing') return;

        if (this.endsAt !== null && now >= this.endsAt) {
            const survivors = this.active().filter((p) => p.role !== 'infected');
            if (survivors.length) this.end('survivors', 'Time ran out with survivors left', now);
            else this.end('infected', 'Everyone was infected', now);
        }
    }

    private active() {
        return [...this.players.values()].filter((p) => p.status === 'active');
    }

    private eliminate(p: Player, now: number, why: string) {
        if (p.status === 'eliminated') return;
        p.status = 'eliminated';
        this.cancelHoldsInvolving(p.id, 'Player left the game');
        this.prox.delete(p.id);
        this.events.push({ t: now - (this.startedAt ?? now), kind: 'eliminated', target: p.name });
        this.out.notice(p.id, { kind: 'eliminated', text: `You were eliminated. ${why}.` });
        this.dirty = true;
        this.checkVictory(now);
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
                    startRole: p.startRole!,
                    finalRole: p.role!,
                    status: p.status,
                    bites: p.bites,
                    heals: p.heals,
                    timesCured: p.timesCured,
                }))
                .sort((a, b) => rank(a) - rank(b) || b.bites - a.bites),
            events: [...this.events],
        };
        this.dirty = true;
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
        const ab = this.prox.get(a.id)?.get(b.bleId);
        const ba = this.prox.get(b.id)?.get(a.bleId);
        const heard = ab && now - ab.at <= PROX_STALE_MS ? ab.zone : undefined;
        const reported = ba && now - ba.at <= PROX_STALE_MS ? ba.zone : undefined;
        if (heard === 'HOT' || reported === 'HOT') return 'HOT';
        if (heard === 'WARM' || reported === 'WARM') return 'WARM';
        return heard ?? reported;
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
        target.roleAcked = target.isBot;
        actor.bites++;
        this.cancelAction(target.id, 'You were infected');
        this.events.push({ t: now - (this.startedAt ?? now), kind: 'bite', actor: actor.name, target: target.name });
        this.out.actionEnd(actor.id, { kind: 'bite', ok: true });
        this.out.notice(actor.id, { kind: 'biteLanded', text: 'Bite landed! They’re one of you now.' });
        this.out.notice(target.id, { kind: 'youWereInfected', text: 'You’ve been bitten. You are INFECTED.' });
        this.dirty = true;
        if (wasDoctor) this.end('infected', 'The doctor was infected', now);
        else this.checkVictory(now);
    }

    private applyHeal(actor: Player, target: Player, now: number) {
        target.role = 'innocent';
        target.roleAcked = target.isBot;
        target.immuneUntil = now + this.settings.immunitySec * 1000;
        target.timesCured++;
        actor.healsLeft--;
        actor.heals++;
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

    debugSetRole(playerId: string, role: Role) {
        this.requireDebug();
        const p = this.players.get(playerId);
        if (!p || this.phase !== 'playing') return;
        p.role = role;
        if (role === 'doctor' && p.healsLeft === 0) p.healsLeft = this.settings.healCharges;
        this.dirty = true;
    }

    /** Bots move around randomly and bite/heal whoever is HOT, so one phone can play a round. */
    private stepBots(now: number) {
        const bots = this.active().filter((p) => p.isBot);
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

    // ---------- views ----------

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
                radar.push(ally ? { bleId: p.bleId, zone, ally, name: p.name } : { bleId: p.bleId, zone, ally });
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
                isHost: p.id === this.hostId,
                isBot: p.isBot,
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
                    }
                    : null,
            radar: radar.sort((a, b) => a.bleId - b.bleId),
            debugProx,
            debugEnabled: this.debugEnabled,
            result: this.result,
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
