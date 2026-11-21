/** Rule tests, mapped to the PRD's MVP acceptance criteria (section 14). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError, Player } from '../src/game';
import type { Role } from '../../shared/protocol';

let t0 = 1_000_000;

// Builds a room with n players, starts it instantly, and gives helpers to fake time + Bluetooth
function setup(n = 4, opts: { doctor?: boolean; infected?: number } = {}) {
    const notices: { to: string; kind: string }[] = [];
    const ends: { to: string; ok: boolean; reason?: string }[] = [];
    const room = new Room('TEST', {
        notice: (to, n) => notices.push({ to, kind: n.kind }),
        actionProgress: () => { },
        actionEnd: (to, p) => ends.push({ to, ok: p.ok, reason: p.reason }),
    });
    let now = t0;
    for (let i = 0; i < n; i++) room.join(`p${i}`, `P${i}`, now);
    room.updateSettings('p0', {
        disperseSec: 0,
        durationSec: 60,
        doctorEnabled: opts.doctor ?? true,
        infectedCount: opts.infected ?? 1,
    });
    for (let i = 1; i < n; i++) room.setReady(`p${i}`, true);
    room.start('p0', now);
    const byRole = (r: Role) => [...room.players.values()].filter((p) => p.role === r);
    const hot = (a: Player, b: Player) => room.reportProx(a.id, [{ bleId: b.bleId, zone: 'HOT', rssi: -50 }], now);
    const cold = (a: Player, b: Player) => room.reportProx(a.id, [{ bleId: b.bleId, zone: 'COLD', rssi: -90 }], now);
    const advance = (ms: number, step = 100) => {
        for (let x = 0; x < ms; x += step) {
            now += step;
            room.tick(now);
        }
    };
    return { room, notices, ends, byRole, hot, cold, advance, now: () => now };
}

test('create/join: room code, duplicate names, host', () => {
    const room = new Room('ABCD');
    room.join('a', 'Sam', t0);
    const b = room.join('b', 'sam', t0);
    const c = room.join('c', 'Sam', t0);
    assert.equal(b.name, 'sam 2');
    assert.equal(c.name, 'Sam 3');
    assert.equal(room.hostId, 'a');
});

test('cannot join a started game, but can rejoin with same id', () => {
    const { room } = setup(3);
    assert.throws(() => room.join('new', 'X', t0), GameError);
    room.disconnect('p1', t0);
    assert.doesNotThrow(() => room.join('p1', 'P1', t0));
    assert.equal(room.players.get('p1')!.connected, true);
});

test('ready check blocks start', () => {
    const room = new Room('ABCD');
    room.join('a', 'A', t0);
    room.join('b', 'B', t0);
    room.join('c', 'C', t0);
    assert.throws(() => room.start('a', t0), /ready/);
    room.setReady('b', true);
    room.setReady('c', true);
    assert.throws(() => room.start('b', t0), /host/);
    room.start('a', t0);
    assert.equal(room.phase, 'countdown');
});

test('need 3 players and at least one innocent', () => {
    const room = new Room('ABCD');
    room.join('a', 'A', t0);
    room.join('b', 'B', t0);
    room.setReady('b', true);
    assert.match(room.startBlockers()[0], /at least 3/);
    room.join('c', 'C', t0);
    room.updateSettings('a', { infectedCount: 2 });
    room.setReady('b', true);
    room.setReady('c', true);
    assert.ok(room.startBlockers().some((b) => /innocent/.test(b)));
});

test('settings: host only, clamped, unready players', () => {
    const room = new Room('ABCD');
    room.join('a', 'A', t0);
    room.join('b', 'B', t0);
    room.setReady('b', true);
    assert.throws(() => room.updateSettings('b', { durationSec: 100 }), GameError);
    room.updateSettings('a', { durationSec: 1, healCharges: 3 });
    assert.equal(room.settings.durationSec, 60);
    assert.deepEqual(room.changedKeys, ['durationSec', 'healCharges']);
    assert.equal(room.players.get('b')!.ready, false);
});

test('role assignment: correct counts, roles hidden during countdown, private', () => {
    const room = new Room('ABCD');
    for (let i = 0; i < 6; i++) room.join(`p${i}`, `P${i}`, t0);
    for (let i = 1; i < 6; i++) room.setReady(`p${i}`, true);
    room.start('p0', t0);
    const roles = [...room.players.values()].map((p) => p.role);
    assert.equal(roles.filter((r) => r === 'infected').length, 1);
    assert.equal(roles.filter((r) => r === 'doctor').length, 1);
    assert.equal(room.viewFor('p1', t0).me!.role, null, 'hidden during dispersal');
    room.tick(t0 + 31_000);
    assert.equal(room.phase, 'playing');
    const v = room.viewFor('p1', t0);
    assert.ok(v.me!.role);
    // No other player's role leaks anywhere in the view
    const json = JSON.stringify(v);
    for (const r of ['infected', 'doctor', 'innocent']) {
        const count = json.split(`"${r}"`).length - 1;
        assert.ok(count <= 1, `role "${r}" appears ${count}x in p1's view`);
    }
});

test('radar: infected see allies, others see anonymous entries', () => {
    const { room, byRole } = setup(6, { infected: 2 });
    const [i1, i2] = byRole('infected');
    const inn = byRole('innocent')[0];
    const vi = room.viewFor(i1.id, 0);
    assert.equal(vi.radar.find((e) => e.bleId === i2.bleId)!.ally, true);
    assert.equal(vi.radar.find((e) => e.bleId === i2.bleId)!.name, i2.name);
    assert.equal(vi.radar.find((e) => e.bleId === inn.bleId)!.ally, false);
    const vn = room.viewFor(inn.id, 0);
    assert.ok(vn.radar.every((e) => !e.ally && !e.name));
    assert.equal(vn.radar.length, 5);
});

test('bite: valid proximity + 2s hold infects target', () => {
    const { room, byRole, hot, advance, notices } = setup(4);
    const inf = byRole('infected')[0];
    const inn = byRole('innocent')[0];
    hot(inf, inn);
    room.startAction(inf.id, inn.bleId, t0);
    for (let i = 0; i < 19; i++) {
        hot(inf, inn);
        advance(100);
    }
    assert.equal(inn.role, 'innocent', 'not yet at 1.9s');
    hot(inf, inn);
    advance(200);
    assert.equal(inn.role, 'infected');
    assert.ok(notices.some((n) => n.to === inn.id && n.kind === 'youWereInfected'));
});

test('invalid bite: too far at start, or leaving range mid-hold', () => {
    const { room, byRole, hot, cold, advance, ends } = setup(4);
    const inf = byRole('infected')[0];
    const inn = byRole('innocent')[0];
    cold(inf, inn);
    assert.throws(() => room.startAction(inf.id, inn.bleId, t0), /far/);
    hot(inf, inn);
    room.startAction(inf.id, inn.bleId, t0);
    advance(500);
    cold(inf, inn);
    advance(1500);
    assert.equal(inn.role, 'innocent');
    assert.equal(ends.at(-1)!.reason, 'Moved out of range');
});

test('walking past (brief HOT) does not infect', () => {
    const { room, byRole, hot, advance } = setup(4);
    const inf = byRole('infected')[0];
    const inn = byRole('innocent')[0];
    hot(inf, inn);
    advance(3000); // reading goes stale, no hold started
    assert.equal(inn.role, 'innocent');
    assert.equal(room.holds.size, 0);
});

test('release cancels the bite', () => {
    const { room, byRole, hot, advance } = setup(4);
    const inf = byRole('infected')[0];
    const inn = byRole('innocent')[0];
    hot(inf, inn);
    room.startAction(inf.id, inn.bleId, t0);
    advance(1000);
    room.cancelAction(inf.id);
    hot(inf, inn);
    advance(2000);
    assert.equal(inn.role, 'innocent');
});

test('proximity from either phone counts (BLE is asymmetric)', () => {
    const { room, byRole, hot, advance } = setup(4);
    const inf = byRole('infected')[0];
    const inn = byRole('innocent')[0];
    hot(inn, inf); // only the target's phone hears the biter
    room.startAction(inf.id, inn.bleId, t0);
    for (let i = 0; i < 22; i++) {
        hot(inn, inf);
        advance(100);
    }
    assert.equal(inn.role, 'infected');
});

test('infected cannot bite infected; innocents cannot act', () => {
    const { room, byRole, hot } = setup(6, { infected: 2 });
    const [i1, i2] = byRole('infected');
    const inn = byRole('innocent')[0];
    hot(i1, i2);
    assert.throws(() => room.startAction(i1.id, i2.bleId, t0), /already infected/);
    hot(inn, i1);
    assert.throws(() => room.startAction(inn.id, i1.bleId, t0), /Innocents/);
});

function holdUntilDone(s: ReturnType<typeof setup>, a: Player, b: Player) {
    s.hot(a, b);
    s.room.startAction(a.id, b.bleId, s.now());
    for (let i = 0; i < 22; i++) {
        s.hot(a, b);
        s.advance(100);
    }
}

test('heal cures, uses a charge, grants immunity; limit enforced', () => {
    const s = setup(6);
    const inf = s.byRole('infected')[0];
    const doc = s.byRole('doctor')[0];
    const [a, b] = s.byRole('innocent');
    holdUntilDone(s, inf, a);
    assert.equal(a.role, 'infected');
    holdUntilDone(s, doc, a);
    assert.equal(a.role, 'innocent');
    assert.equal(doc.healsLeft, 1);
    // Reinfection protection
    s.hot(inf, a);
    assert.throws(() => s.room.startAction(inf.id, a.bleId, s.now()), /immune/);
    s.advance(10_100);
    holdUntilDone(s, inf, a);
    assert.equal(a.role, 'infected');
    holdUntilDone(s, doc, a);
    assert.equal(doc.healsLeft, 0);
    holdUntilDone(s, inf, b);
    s.hot(doc, b);
    assert.throws(() => s.room.startAction(doc.id, b.bleId, s.now()), /No heals/);
});

test('doctor cannot heal innocents (no charge used)', () => {
    const s = setup(4);
    const doc = s.byRole('doctor')[0];
    const inn = s.byRole('innocent')[0];
    s.hot(doc, inn);
    assert.throws(() => s.room.startAction(doc.id, inn.bleId, s.now()), /no effect/);
    assert.equal(doc.healsLeft, 2);
});

test('doctor infected => immediate infected victory', () => {
    const s = setup(5);
    holdUntilDone(s, s.byRole('infected')[0], s.byRole('doctor')[0]);
    assert.equal(s.room.phase, 'ended');
    assert.equal(s.room.result!.winner, 'infected');
    assert.match(s.room.result!.reason, /doctor/);
});

test('everyone infected => infected win', () => {
    const s = setup(3, { doctor: false });
    const inf = s.byRole('infected')[0];
    const [a, b] = s.byRole('innocent');
    holdUntilDone(s, inf, a);
    assert.equal(s.room.phase, 'playing');
    holdUntilDone(s, inf, b);
    assert.equal(s.room.result!.winner, 'infected');
});

test('timer runs out with a survivor => survivors win', () => {
    const s = setup(4);
    s.advance(61_000, 500);
    assert.equal(s.room.result!.winner, 'survivors');
    assert.equal(s.room.result!.standings.length, 4);
});

test('race: doctor and infected on the same target, first to start wins', () => {
    const s = setup(6, { infected: 2 });
    const [i1, i2] = s.byRole('infected');
    const doc = s.byRole('doctor')[0];
    const inn = s.byRole('innocent')[0];
    holdUntilDone(s, i1, inn); // inn now infected
    s.hot(doc, inn);
    s.hot(i2, doc);
    s.room.startAction(doc.id, inn.bleId, s.now()); // doctor starts healing inn
    s.advance(500);
    s.hot(i2, doc);
    s.room.startAction(i2.id, doc.bleId, s.now()); // i2 starts biting doctor
    for (let i = 0; i < 25; i++) {
        s.hot(doc, inn);
        s.hot(i2, doc);
        s.advance(100);
    }
    assert.equal(inn.role, 'innocent', 'heal finished first');
    assert.equal(s.room.result?.winner, 'infected', 'then the doctor got bitten');
});

test('disconnect: protected, state kept, eliminated after window', () => {
    const s = setup(5);
    const inf = s.byRole('infected')[0];
    const inn = s.byRole('innocent')[0];
    s.room.disconnect(inn.id, s.now());
    s.hot(inf, inn);
    assert.throws(() => s.room.startAction(inf.id, inn.bleId, s.now()), /protected/);
    s.advance(10_000, 500);
    s.room.join(inn.id, 'whatever', s.now());
    assert.equal(inn.status, 'active');
    assert.equal(inn.role, 'innocent');
    s.room.disconnect(inn.id, s.now());
    s.advance(31_000, 500);
    assert.equal(inn.status, 'eliminated');
    assert.equal(s.room.viewFor(inf.id, s.now()).radar.some((e) => e.bleId === inn.bleId), false);
});

test('host migration keeps the game going', () => {
    const s = setup(4);
    s.room.disconnect('p0', s.now());
    assert.equal(s.room.hostId, 'p1');
    assert.equal(s.room.phase, 'playing');
    assert.ok(s.notices.some((n) => n.to === 'p1' && n.kind === 'youAreHost'));
});

test('bots + debug proximity let one human play', () => {
    const room = new Room('ABCD');
    room.join('me', 'Me', t0);
    room.addBots(3, t0);
    room.updateSettings('me', { disperseSec: 0 });
    room.start('me', t0);
    room.debugSetRole('me', 'infected');
    const bot = [...room.players.values()].find((p) => p.isBot && p.role !== 'infected')!;
    room.setDebugProx('me', bot.bleId, 'HOT');
    room.startAction('me', bot.bleId, t0);
    let now = t0;
    for (let i = 0; i < 25; i++) room.tick((now += 100));
    assert.equal(bot.role, 'infected');
});