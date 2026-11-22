/** Demo players: simulated people on fake GPS who walk, chase, flee, and act through the normal rules. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Room,
    GameError,
    Player,
    distanceMeters,
    offsetMeters,
    DEMO_MAX_MPS,
    DEMO_HOT_M,
    DEMO_WARM_M,
    DEMO_SPAWN_M,
} from '../src/game';
import { DEMO_PING_INTERVAL_MS, type LatLng, type Role } from '../../shared/protocol';

const t0 = 1_000_000;
const HOME: LatLng = { lat: 37.7749, lng: -122.4194 };

/** Host p0 (real) + 3 demo players, round started with the zone on. */
function setup(opts: { roles?: Role[]; durationSec?: number } = {}) {
    const notices: { to: string; kind: string }[] = [];
    const room = new Room('DEMO', {
        notice: (to, n) => notices.push({ to, kind: n.kind }),
        actionProgress: () => { },
        actionEnd: () => { },
    }, false); // demo players must work with debug tools off
    let now = t0;
    room.join('p0', 'Host', now);
    room.addDemoPlayers('p0', now);
    room.updateSettings('p0', { disperseSec: 0, durationSec: opts.durationSec ?? 900, biteHoldMs: 1000, healHoldMs: 1000 });
    room.start('p0', now);
    const host = room.players.get('p0')!;
    const bots = [...room.players.values()].filter((p) => p.demo);
    if (opts.roles) {
        // roles[0] = host, then the bots in order
        [host, ...bots].forEach((p, i) => {
            p.role = p.startRole = opts.roles![i];
            p.healsLeft = p.role === 'doctor' ? 2 : 0;
        });
    }
    let hostAt = HOME;
    const loc = (p: LatLng) => { hostAt = p; room.reportLoc('p0', p, now); };
    loc(HOME);
    const advance = (ms: number, step = 100) => {
        for (let x = 0; x < ms; x += step) {
            now += step;
            if (now % 3000 === 0) room.reportLoc('p0', hostAt, now); // the phone re-sends every 3 s
            room.tick(now);
            if (room.phase !== 'playing') return;
        }
    };
    const pos = (p: Player) => room.positions.get(p.id)!;
    return { room, host, bots, notices, loc, advance, pos, now: () => now };
}

test('host adds 3 demo players with real names; debug off is fine; not after start', () => {
    const room = new Room('R', undefined, false);
    room.join('h', 'Host', t0);
    room.join('x', 'X', t0);
    assert.throws(() => room.addDemoPlayers('x', t0), /host/);
    room.addDemoPlayers('h', t0);
    const demo = [...room.players.values()].filter((p) => p.demo);
    assert.deepEqual(demo.map((p) => p.name), ['Maya', 'Jordan', 'Sam']);
    assert.ok(demo.every((p) => p.isBot && p.ready));
    const view = room.viewFor('h', t0);
    assert.equal(view.players.filter((p) => p.isDemo).length, 3);
    room.setReady('x', true);
    room.start('h', t0);
    assert.throws(() => room.addDemoPlayers('h', t0), GameError);
});

test('demo players spawn 20-60 m from the host, walk within speed limits, never teleport, stay in the zone', () => {
    // Everyone a survivor, so the walk is just wandering for the whole stretch.
    const { room, bots, advance, pos } = setup({ roles: ['innocent', 'innocent', 'innocent', 'doctor'] });
    advance(1000);
    for (const b of bots) {
        const d = distanceMeters(pos(b), HOME);
        assert.ok(d >= DEMO_SPAWN_M[0] - 0.5 && d <= DEMO_SPAWN_M[1] + 0.5, `spawn ${d}`);
    }
    let last = new Map(bots.map((b) => [b.id, { ...pos(b) }]));
    let moved = 0;
    for (let s = 0; s < 170; s++) { // the first shrink is at 180 s (covered by the next test)
        advance(1000);
        if (room.phase !== 'playing') break;
        for (const b of bots) {
            if (b.status !== 'active') continue;
            const step = distanceMeters(last.get(b.id)!, pos(b));
            assert.ok(step <= DEMO_MAX_MPS * 1.05 + 0.01, `${b.name} moved ${step.toFixed(2)} m in 1 s`);
            moved += step;
            const z = room.zone!;
            assert.ok(distanceMeters(pos(b), z.center) <= z.radiusM, `${b.name} left the zone`);
        }
        last = new Map(bots.map((b) => [b.id, { ...pos(b) }]));
    }
    assert.ok(moved > 50, 'they actually walk around');
});

test('after the zone shrinks below where a demo player is, it walks back in (no teleport)', () => {
    const { room, bots, advance, pos } = setup({ roles: ['innocent', 'innocent', 'innocent', 'doctor'] });
    advance(1000);
    const b = bots[0];
    // Put the bot 40 m out and shrink the zone to 20 m around the center.
    const z = room.zone!;
    const s = room.demoBots.get(b.id)!;
    s.pos = offsetMeters(z.center, 40, 90);
    z.radiusM = 20;
    let prev = distanceMeters(s.pos, z.center);
    for (let i = 0; i < 40 && prev > 20; i++) {
        advance(1000);
        const d = distanceMeters(pos(b), z.center);
        assert.ok(prev - d <= DEMO_MAX_MPS * 1.05 + 0.01);
        prev = d;
    }
    assert.ok(prev <= 20, `back inside (${prev.toFixed(1)} m)`);
});

test('proximity to a demo player comes from GPS distance (HOT / WARM / COLD / out of range)', () => {
    const { room, host, bots, now } = setup();
    const b = bots[0];
    const at = (m: number) => {
        room.positions.set(b.id, { ...offsetMeters(HOME, m, 45), at: now() });
        return room.viewFor('p0', now()).radar.find((r) => r.bleId === b.bleId)!.zone;
    };
    assert.equal(at(DEMO_HOT_M - 1), 'HOT');
    assert.equal(at(DEMO_WARM_M - 1), 'WARM');
    assert.equal(at(30), 'COLD');
    assert.equal(at(200), undefined);
    room.positions.set(b.id, { ...offsetMeters(HOME, 2, 45), at: now() });
    assert.equal(room.inRange(host, b, now()), true);
});

test('an infected demo player chases the host and bites through the normal rules', () => {
    const { room, host, bots, notices, advance } = setup({ roles: ['innocent', 'infected', 'innocent', 'innocent'] });
    advance(180_000);
    assert.equal(host.role, 'infected', 'host got bitten');
    assert.ok(notices.some((n) => n.to === 'p0' && n.kind === 'youWereInfected'));
    const bite = room.events.find((e) => e.kind === 'bite' && e.target === 'Host');
    assert.ok(bite && bots.some((b) => b.name === bite.actor), 'bitten by a demo player');
});

test('a demo bite respects immunity', () => {
    const { room, host, advance, now } = setup({ roles: ['innocent', 'infected', 'innocent', 'innocent'] });
    host.immuneUntil = now() + 10 * 60_000;
    advance(90_000);
    assert.notEqual(host.role, 'infected');
    assert.ok(!room.events.some((e) => e.target === 'Host'));
});

test('chasing is slower than walking, so a real player who walks away is not caught', () => {
    const { room, host, bots, advance, loc, pos, now } = setup({ roles: ['innocent', 'infected', 'innocent', 'innocent'], durationSec: 600 });
    advance(1000);
    const z = room.zone!;
    // The infected bot starts 20 m west of the host, who walks east at 1.4 m/s for 60 s.
    const s = room.demoBots.get(bots[0].id)!;
    s.pos = offsetMeters(z.center, 20, 270);
    room.positions.set(bots[0].id, { ...s.pos, at: now() });
    let me = z.center;
    loc(me);
    const gap0 = distanceMeters(pos(bots[0]), me);
    for (let i = 0; i < 60; i++) {
        me = offsetMeters(me, 1.4, 90);
        loc(me);
        advance(1000);
    }
    assert.equal(host.role, 'innocent');
    assert.ok(distanceMeters(pos(bots[0]), me) > gap0, 'the gap grew');
});

test('a survivor demo player backs away from a WARM infected', () => {
    const { room, host, bots, now, advance, pos } = setup({ roles: ['infected', 'innocent', 'innocent', 'doctor'] });
    advance(1000);
    const b = bots[0];
    const s = room.demoBots.get(b.id)!;
    s.pos = offsetMeters(HOME, 10, 0); // 10 m north of the infected host
    s.heading = 180; // facing the host
    room.positions.set(b.id, { ...s.pos, at: now() });
    const before = distanceMeters(s.pos, HOME);
    advance(5000);
    assert.ok(distanceMeters(pos(b), HOME) > before, 'moved away');
    assert.notEqual(host.role, null);
});

test('a demo doctor walks up to a nearby infected and heals them', () => {
    const { room, host, bots, notices, now, advance } = setup({ roles: ['infected', 'innocent', 'innocent', 'doctor'] });
    advance(1000);
    const doc = bots[2];
    const s = room.demoBots.get(doc.id)!;
    s.pos = offsetMeters(HOME, 10, 0);
    s.heading = 180;
    room.positions.set(doc.id, { ...s.pos, at: now() });
    advance(20_000);
    assert.equal(host.role, 'innocent', 'host cured');
    assert.ok(notices.some((n) => n.to === 'p0' && n.kind === 'youWereCured'));
    assert.equal(doc.healsLeft, 1);
});

test('demo positions respect role visibility; demo rooms ping every 10 s', () => {
    const { room, bots, advance, pos } = setup({ roles: ['innocent', 'infected', 'innocent', 'doctor'] });
    advance(DEMO_PING_INTERVAL_MS + 1000);
    // Innocent viewer: anonymous fuzzed pings of all 3 bots, no ally pins, no names on radar.
    const v = room.viewFor('p0', t0 + DEMO_PING_INTERVAL_MS + 1000);
    assert.equal(v.pingEveryMs, DEMO_PING_INTERVAL_MS);
    assert.equal(v.allies.length, 0);
    assert.equal(v.pings.length, 3);
    assert.ok(v.radar.every((r) => r.name === undefined && !r.ally));
    // Infected viewer: live pin for the infected bot only, no pings.
    room.players.get('p0')!.role = 'infected';
    const w = room.viewFor('p0', t0 + DEMO_PING_INTERVAL_MS + 1000);
    assert.equal(w.pings.length, 0);
    assert.deepEqual(w.allies.map((a) => a.name), [bots[0].name]);
    assert.ok(distanceMeters(w.allies[0], pos(bots[0])) < 0.01, 'ally pin is the live position');
});
