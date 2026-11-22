/** Round feel: danger level for survivors, anonymous kill feed, recap MVPs, short-round defaults. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, Player } from '../src/game';
import { DEFAULT_SETTINGS, ZONE_WARNING_MS, type Role } from '../../shared/protocol';

const t0 = 2_000_000;

function setup(n = 5) {
    const room = new Room('FEEL', { notice() { }, actionProgress() { }, actionEnd() { } });
    let now = t0;
    for (let i = 0; i < n; i++) room.join(`p${i}`, `Player${i}`, now);
    room.updateSettings('p0', { disperseSec: 0, biteHoldMs: 1000, healHoldMs: 1000, durationSec: 300 });
    for (let i = 1; i < n; i++) room.setReady(`p${i}`, true);
    room.start('p0', now);
    const one = (r: Role) => [...room.players.values()].find((p) => p.role === r)!;
    const all = (r: Role) => [...room.players.values()].filter((p) => p.role === r);
    const prox = (a: Player, b: Player, zone: 'HOT' | 'WARM' | 'COLD') =>
        room.reportProx(a.id, [{ bleId: b.bleId, zone, rssi: -60 }], now);
    const advance = (ms: number) => {
        for (let x = 0; x < ms; x += 100) {
            now += 100;
            room.tick(now);
        }
    };
    /** Keep a's reading of b fresh while time passes (phones report every 500 ms). */
    const hold = (a: Player, b: Player, ms: number) => {
        for (let x = 0; x < ms; x += 500) {
            prox(a, b, 'HOT');
            advance(500);
        }
    };
    /** Walk up (HOT), start the bite/heal through the normal rules, and hold until it lands. */
    const act = (a: Player, b: Player) => {
        prox(a, b, 'HOT');
        room.startAction(a.id, b.bleId, now);
        hold(a, b, 1500);
    };
    return { room, one, all, prox, advance, hold, act, now: () => now };
}

test('short-round defaults: 6 min rounds, 100 m zone shrinking every 90 s, 20 s warning', () => {
    assert.equal(DEFAULT_SETTINGS.durationSec, 360);
    assert.equal(DEFAULT_SETTINGS.zoneStartRadiusM, 100);
    assert.equal(DEFAULT_SETTINGS.zoneShrinkSec, 90);
    assert.equal(ZONE_WARNING_MS, 20_000);
    assert.equal(new Room('X').settings.durationSec, 360);
});

test('danger: survivors get the closest infected proximity; infected never do', () => {
    const { room, one, all, prox, now } = setup();
    const inf = one('infected');
    const [a, b] = all('innocent');
    const doc = one('doctor');
    assert.equal(room.viewFor(a.id, now()).me!.danger, null, 'nothing heard yet');
    prox(inf, a, 'WARM');
    assert.equal(room.viewFor(a.id, now()).me!.danger, 'WARM');
    prox(a, inf, 'HOT'); // either phone counts
    assert.equal(room.viewFor(a.id, now()).me!.danger, 'HOT');
    // A nearby survivor is not danger.
    prox(b, doc, 'HOT');
    assert.equal(room.viewFor(doc.id, now()).me!.danger, null);
    assert.equal(room.viewFor(b.id, now()).me!.danger, null);
    // Infected players never get a danger level, even next to each other's victims.
    assert.equal(room.viewFor(inf.id, now()).me!.danger, null);
    // It never names anyone: only a bucket.
    assert.ok(['HOT', 'WARM', 'COLD', null].includes(room.viewFor(a.id, now()).me!.danger ?? null));
});

test('danger level: closer means stronger (0..1), COLD is none, infected never get it', () => {
    const { room, one, all, now } = setup();
    const inf = one('infected');
    const [a] = all('innocent');
    const level = () => room.viewFor(a.id, now()).me!.dangerLevel ?? null;
    const hear = (zone: 'HOT' | 'WARM' | 'COLD', rssi: number) => room.reportProx(a.id, [{ bleId: inf.bleId, zone, rssi }], now());
    hear('COLD', -92);
    assert.equal(level(), null, 'COLD is no heartbeat');
    hear('WARM', -84);
    const warmFar = level()!;
    hear('WARM', -70);
    const warmNear = level()!;
    hear('HOT', -62);
    const hotFar = level()!;
    hear('HOT', -46);
    const hotNear = level()!;
    assert.ok(warmFar > 0 && warmFar < warmNear && warmNear <= 0.5, `${warmFar} < ${warmNear}`);
    assert.ok(hotFar >= 0.55 && hotFar < hotNear && hotNear <= 1, `${hotFar} < ${hotNear}`);
    assert.equal(Math.round(hotNear * 20), hotNear * 20, 'coarse steps of 0.05');
    assert.equal(room.viewFor(inf.id, now()).me!.dangerLevel, null, 'infected never get it');
});

test('kill feed: anonymous lines for infections and cures, with survivors left', () => {
    const { room, one, all, act, now } = setup();
    const inf = one('infected');
    const victim = all('innocent')[0];
    act(inf, victim);
    assert.equal(victim.role, 'infected');
    const doc = one('doctor');
    act(doc, victim);
    assert.equal(victim.role, 'innocent');
    const feed = room.viewFor('p0', now()).feed!;
    assert.deepEqual(feed.map((f) => f.kind), ['infected', 'cured']);
    assert.match(feed[0].text, /^Someone was infected… 3 survivors left$/);
    assert.match(feed[1].text, /^Someone was cured\. 4 survivors left$/);
    const names = [...room.players.values()].map((p) => p.name);
    for (const f of feed) for (const n of names) assert.ok(!f.text.includes(n), `feed leaks ${n}`);
});

test('kill feed: leaving mid-round shows up anonymously', () => {
    const { room, all, now } = setup();
    const quitter = all('innocent')[0];
    room.leave(quitter.id, now());
    const f = room.viewFor('p0', now()).feed!.at(-1)!;
    assert.equal(f.kind, 'eliminated');
    assert.equal(f.text, 'Someone left the game… 3 survivors left');
    assert.ok(!f.text.includes(quitter.name));
});

test('recap: infection chain in order with times, and MVPs', () => {
    const { room, one, all, act, now } = setup();
    const zero = one('infected');
    const [a, b] = all('innocent');
    act(zero, a);
    act(a, b);
    const doc = one('doctor');
    act(zero, doc); // biting the doctor ends the round
    assert.equal(room.phase, 'ended');
    const r = room.result!;
    const bites = r.events.filter((e) => e.kind === 'bite');
    assert.deepEqual(bites.map((e) => [e.actor, e.target]), [[zero.name, a.name], [a.name, b.name], [zero.name, doc.name]]);
    assert.ok(bites[0].t < bites[1].t && bites[1].t < bites[2].t, 'in order, with times');
    const mvp = Object.fromEntries(r.mvps!.map((m) => [m.title, m]));
    assert.equal(mvp['Most infections'].name, zero.name);
    assert.equal(mvp['Most infections'].detail, '2 bites');
    assert.equal(mvp['Patient zero'].name, zero.name);
    // The last innocent was never bitten, so they're the longest survivor.
    const untouched = all('innocent').find((p) => p !== a && p !== b)!;
    assert.equal(mvp['Longest survivor'].name, untouched.name);
    assert.equal(mvp['Longest survivor'].detail, 'Never infected');
    assert.equal(mvp['Best doctor'], undefined, 'no cures, no doctor award');
});
