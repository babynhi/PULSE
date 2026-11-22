/** Safe zone, GPS positions, ally visibility and pings. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, distanceMeters, offsetMeters, LOC_STALE_MS, ZONE_FIX_WAIT_MS, PING_FUZZ_M } from '../src/game';
import { PING_INTERVAL_MS, PING_DELAY_MS, ZONE_WARNING_MS, ZONE_MIN_RADIUS_M } from '../../shared/protocol';
import type { Role } from '../../shared/protocol';

const HOME = { lat: 37.7749, lng: -122.4194 };

function setup(opts: { zone?: boolean; n?: number; infected?: number } = {}) {
    const notices: { to: string; kind: string; text: string }[] = [];
    let seed = 42;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const room = new Room('ZONE', { notice: (to, n) => notices.push({ to, ...n }), actionProgress() { }, actionEnd() { } }, true, rng);
    let now = 5_000_000;
    const n = opts.n ?? 4;
    for (let i = 0; i < n; i++) room.join(`p${i}`, `P${i}`, now);
    room.updateSettings('p0', {
        disperseSec: 0, durationSec: 1800, zoneEnabled: opts.zone ?? true,
        zoneStartRadiusM: 100, zoneShrinkSec: 60, zoneGraceSec: 10, infectedCount: opts.infected ?? 1,
    });
    room.settings.durationSec = 1800; // longer than the 8 min cap, so the zone tests can run long
    for (let i = 1; i < n; i++) room.setReady(`p${i}`, true);
    room.start('p0', now);
    const at = (id: string, meters: number, bearing = 0) => room.reportLoc(id, offsetMeters(HOME, meters, bearing), now);
    const allAt = (meters = 0) => { for (const id of room.players.keys()) at(id, meters, 90); };
    const advance = (ms: number, step = 100, keepFresh = true) => {
        for (let x = 0; x < ms; x += step) {
            now += step;
            // phones report every few seconds: re-send the last known spot
            if (keepFresh && x % 3000 === 0) for (const [id, f] of room.positions) if (!room.players.get(id)!.isBot) room.reportLoc(id, f, now);
            room.tick(now);
        }
    };
    const byRole = (r: Role) => [...room.players.values()].filter((p) => p.role === r);
    return { room, notices, at, allAt, advance, byRole, now: () => now };
}

test('geo helpers: offset then distance round-trips', () => {
    for (const m of [5, 50, 500]) assert.ok(Math.abs(distanceMeters(HOME, offsetMeters(HOME, m, 123)) - m) < 0.5);
});

test('zone is placed at the centroid of players with a fix, with the start radius', () => {
    const s = setup();
    s.at('p0', 0); s.at('p1', 40, 90); s.at('p2', 40, 270); // centroid ~ HOME
    s.advance(200);
    const v = s.room.viewFor('p0', s.now());
    assert.ok(v.zone, 'zone placed');
    assert.equal(v.zone!.radiusM, 100);
    assert.ok(distanceMeters(v.zone!.center, HOME) < 15);
    assert.equal(v.zone!.nextRadiusM, 70);
});

test('zone shrinks on schedule to ~70% with a warning first, down to a minimum', () => {
    const s = setup();
    s.allAt(0);
    s.advance(200);
    const first = s.room.viewFor('p0', s.now()).zone!;
    assert.equal(first.warning, false);
    s.advance(60_000 - ZONE_WARNING_MS);
    assert.equal(s.room.viewFor('p0', s.now()).zone!.warning, true, 'warning before the shrink');
    assert.ok(s.notices.some((n) => n.text.includes(`shrinks in ${ZONE_WARNING_MS / 1000}`)), 'warning notice');
    s.advance(ZONE_WARNING_MS + 200);
    assert.equal(s.room.viewFor('p0', s.now()).zone!.radiusM, 70);
    for (let i = 0; i < 20; i++) s.advance(60_000);
    const z = s.room.viewFor('p0', s.now()).zone!;
    assert.equal(z.radiusM, ZONE_MIN_RADIUS_M);
    assert.equal(z.shrinksAt, null, 'stops shrinking at the minimum');
});

test('outside the zone: grace countdown, then eliminated', () => {
    const s = setup({ n: 5 });
    s.allAt(0);
    s.advance(200);
    const victim = s.byRole('innocent')[0];
    s.at(victim.id, 150);
    s.advance(200);
    const me = s.room.viewFor(victim.id, s.now()).me!;
    assert.ok(me.outsideZoneSince !== null && me.graceEndsAt !== null, 'grace running');
    assert.equal(me.graceEndsAt! - me.outsideZoneSince!, 10_000);
    s.advance(10_200);
    assert.equal(s.room.players.get(victim.id)!.status, 'eliminated');
    assert.ok(s.notices.some((n) => n.to === victim.id && n.kind === 'eliminated'));
});

test('coming back inside resets the grace period', () => {
    const s = setup({ n: 5 });
    s.allAt(0);
    s.advance(200);
    const p = s.byRole('innocent')[0];
    s.at(p.id, 150);
    s.advance(6_000);
    s.at(p.id, 10);
    s.advance(200);
    assert.equal(s.room.viewFor(p.id, s.now()).me!.outsideZoneSince, null);
    s.at(p.id, 150);
    s.advance(6_000);
    assert.equal(p.status, 'active', 'fresh grace after coming back');
});

test('a stale or missing fix is never punished', () => {
    const s = setup({ n: 5 });
    s.allAt(0);
    s.advance(200);
    const p = s.byRole('innocent')[0];
    s.at(p.id, 500);
    s.room.positions.get(p.id)!.at -= LOC_STALE_MS + 1; // fix went stale
    s.advance(15_000, 100, false);
    assert.equal(p.status, 'active');
});

test('house-party mode (zone off): no zone, nobody eliminated for distance', () => {
    const s = setup({ zone: false });
    s.allAt(0);
    s.at('p1', 5000);
    s.advance(20_000);
    const v = s.room.viewFor('p1', s.now());
    assert.equal(v.zone, null);
    assert.equal(s.room.players.get('p1')!.status, 'active');
});

test('no GPS from anyone: zone turned off for the round with a notice', () => {
    const s = setup();
    s.advance(ZONE_FIX_WAIT_MS + 200);
    assert.equal(s.room.viewFor('p0', s.now()).zone, null);
    assert.ok(s.notices.some((n) => /safe zone is off/.test(n.text)));
});

test('ally positions only reach infected players, never others', () => {
    const s = setup({ n: 6, infected: 2 });
    s.allAt(0);
    s.advance(200);
    const [a, b] = s.byRole('infected');
    const v = s.room.viewFor(a.id, s.now());
    assert.equal(v.allies.length, 1);
    assert.equal(v.allies[0].id, b.id);
    for (const p of [...s.room.players.values()].filter((x) => x.role !== 'infected')) {
        assert.deepEqual(s.room.viewFor(p.id, s.now()).allies, [], `${p.role} must not see positions`);
    }
    // a freshly bitten player is infected, so now sees allies too
    const inn = s.byRole('innocent')[0];
    inn.role = 'infected';
    assert.equal(s.room.viewFor(inn.id, s.now()).allies.length, 2);
});

test('pings: sampled every 30 s, fuzzed 20-40 m, released only after the delay, labelled with their age', () => {
    const s = setup({ n: 4 });
    for (const [i, id] of [...s.room.players.keys()].entries()) s.at(id, 30 * i, 45);
    s.advance(200);
    const viewer = s.byRole('infected')[0].id;
    s.advance(PING_INTERVAL_MS);
    assert.deepEqual(s.room.viewFor(viewer, s.now()).pings, [], 'sampled, but still held back');
    const sampledAt = s.room['pingQueue'][0]?.at;
    assert.ok(sampledAt, 'a sample is queued');
    s.advance(PING_DELAY_MS);
    const v = s.room.viewFor(viewer, s.now());
    assert.equal(v.pings.length, 3, 'every survivor, never yourself');
    assert.ok(v.pingAt !== null);
    assert.ok(v.pings.every((p) => p.at === sampledAt), 'each dot says when it was true');
    assert.ok(s.now() - v.pings[0].at >= PING_DELAY_MS, 'always at least the delay old');
    assert.ok(v.pings.every((x) => Object.keys(x).sort().join() === 'at,lat,lng'), 'pings carry no id, name or role');
    for (const [id, ping] of s.room.pings) {
        const real = s.room.positions.get(id)!;
        const d = distanceMeters(real, ping);
        assert.ok(d >= PING_FUZZ_M[0] - 0.5 && d <= PING_FUZZ_M[1] + 0.5, `fuzz ${d.toFixed(1)} m`);
    }
    // Where they move after the sample doesn't show until the next release.
    const runner = s.byRole('innocent')[0];
    s.at(runner.id, 400, 0);
    assert.deepEqual(s.room.viewFor(viewer, s.now()).pings, v.pings, 'old snapshot, not live');
    const firstAt = v.pingAt;
    s.advance(PING_INTERVAL_MS);
    assert.ok(s.room.viewFor(viewer, s.now()).pingAt! > firstAt!, 'pings again');
});

test('role-based map: innocent and doctor see nobody; infected see allies live and survivors on the ping', () => {
    const s = setup({ n: 6, infected: 2 });
    for (const [i, id] of [...s.room.players.keys()].entries()) s.at(id, 20 * i, 60 * i);
    s.advance(200);
    s.advance(PING_INTERVAL_MS + PING_DELAY_MS);
    const [inf1, inf2] = s.byRole('infected');
    const inn = s.byRole('innocent')[0];
    const doc = s.byRole('doctor')[0];
    for (const p of [inn, doc]) {
        const v = s.room.viewFor(p.id, s.now());
        assert.deepEqual(v.pings, [], `${p.role} sees no pings`);
        assert.equal(v.pingAt, null);
        assert.deepEqual(v.allies, [], `${p.role} gets no live positions`);
    }
    const vi = s.room.viewFor(inf1.id, s.now());
    assert.equal(vi.pings.length, 4, 'infected see every survivor (doctor included), fuzzed');
    assert.ok(vi.pingAt !== null);
    assert.deepEqual(vi.allies.map((a) => a.id), [inf2.id], 'infected see fellow infected live');

    // bitten mid-round: switches to the infected map at once, and drops off the survivor ping
    inn.role = 'infected';
    const vb = s.room.viewFor(inn.id, s.now());
    assert.equal(vb.pings.length, 3);
    assert.equal(vb.allies.length, 2);
    assert.equal(s.room.viewFor(inf1.id, s.now()).pings.length, 3);
    // cured: back to the empty survivor map at once
    inf2.role = 'innocent';
    const vc = s.room.viewFor(inf2.id, s.now());
    assert.equal(vc.allies.length, 0);
    assert.equal(vc.pings.length, 0);

    // an eliminated player drops off the ping and sees none
    const out = s.byRole('innocent').find((p) => p.id !== inf2.id)!;
    const before = s.room.viewFor(inf1.id, s.now()).pings.length;
    out.status = 'eliminated';
    assert.equal(s.room.viewFor(inf1.id, s.now()).pings.length, before - 1);
    assert.deepEqual(s.room.viewFor(out.id, s.now()).pings, []);
});

test('infection marker: fuzzed spot shown to everyone for 60 s, anonymous', () => {
    const s = setup({ n: 5 });
    s.allAt(0);
    s.advance(200);
    const inf = s.byRole('infected')[0];
    const inn = s.byRole('innocent')[0];
    s.room.setDebugProx(inf.id, inn.bleId, 'HOT');
    s.room.startAction(inf.id, inn.bleId, s.now());
    s.advance(s.room.settings.biteHoldMs + 200);
    assert.equal(inn.role, 'infected');
    for (const p of s.room.players.values()) {
        const marks = s.room.viewFor(p.id, s.now()).infectionMarks!;
        assert.equal(marks.length, 1, `${p.role} sees the marker`);
        assert.deepEqual(Object.keys(marks[0]).sort(), ['at', 'id', 'lat', 'lng'], 'no name or role');
        const d = distanceMeters(marks[0], s.room.positions.get(inn.id)!);
        assert.ok(d >= 4.5 && d <= 15.5, `approximate (${d.toFixed(1)} m off)`);
    }
    s.advance(60_000);
    assert.deepEqual(s.room.viewFor(inn.id, s.now()).infectionMarks, [], 'gone after 60 s');
});

test('bad location reports are ignored', () => {
    const s = setup();
    for (const bad of [{ lat: 999, lng: 0 }, { lat: NaN, lng: 1 }, { lat: 0, lng: 0 }, { lat: 1, lng: 1, acc: 9999 }, {} as any])
        s.room.reportLoc('p1', bad, s.now());
    assert.equal(s.room.positions.has('p1'), false);
});
