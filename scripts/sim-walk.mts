/**
 * Simulated walk with a fake compass.
 * The iOS simulator has no magnetometer, so heading comes from the direction
 * of travel. This runs that path: walk north, turn east, then a real compass
 * sample takes over the way a phone will.
 *
 *   node --experimental-strip-types scripts/sim-walk.mts
 */
import assert from 'node:assert/strict';
import {
    angleDelta,
    beamScreenAngle,
    bearingDeg,
    distanceM,
    lerpAngle,
    nextHeading,
    resolveHeading,
    smoothHeading,
    stepCamera,
    type CameraState,
    type CompassSample,
    type HeadingTrack,
    type LatLng,
} from '../app/src/rooms/heading.ts';

const TICKS_PER_FIX = 20; // 50 ms camera ticks across one 1 s GPS step

function move(from: LatLng, bearing: number, meters: number): LatLng {
    const dLat = meters / 111_320;
    const dLng = meters / (111_320 * Math.cos((from.latitude * Math.PI) / 180));
    const r = (bearing * Math.PI) / 180;
    return {
        latitude: from.latitude + dLat * Math.cos(r),
        longitude: from.longitude + dLng * Math.sin(r),
    };
}

function near(actual: number, expected: number, slack: number, label: string) {
    const delta = Math.abs(angleDelta(actual, expected));
    assert.ok(delta <= slack, `${label}: expected ${expected}°, got ${actual.toFixed(1)}° (Δ ${delta.toFixed(1)}°)`);
}

type Walker = {
    pos: LatLng;
    shown: number | null;
    target: number | null;
    track: HeadingTrack;
    cam: CameraState;
    facingUp: boolean;
    compass: CompassSample | null;
};

function makeWalker(start: LatLng): Walker {
    return {
        pos: start,
        shown: null,
        target: null,
        track: { anchor: null, heading: null },
        cam: { ...start, heading: 0 },
        facingUp: false,
        compass: null,
    };
}

/** One GPS fix and the camera frames that play before the next one. */
function stepWalk(w: Walker, bearing: number, meters: number, course: number | null) {
    const next = move(w.pos, bearing, meters);
    const result = nextHeading(w.track, w.compass, { ...next, speed: course == null ? 0 : meters, course });
    w.track = result.track;
    if (result.track.heading != null && result.source !== 'hold') w.target = result.track.heading;
    w.pos = next;
    for (let i = 0; i < TICKS_PER_FIX; i++) tick(w);
}

function tick(w: Walker) {
    w.shown = smoothHeading(w.shown, w.target, 0.28);
    w.cam = stepCamera(w.cam, w.pos, w.shown, w.facingUp);
}

function settle(w: Walker, frames: number) {
    for (let i = 0; i < frames; i++) tick(w);
}

const start = { latitude: 37.7694, longitude: -122.4862 };
assert.ok(Math.abs(angleDelta(bearingDeg(start, move(start, 0, 25)), 0)) < 1, 'north bearing');
assert.ok(Math.abs(angleDelta(bearingDeg(start, move(start, 90, 25)), 90)) < 1, 'east bearing');
assert.equal(lerpAngle(350, 10, 0.5), 0);
assert.equal(Math.round(Math.abs(angleDelta(10, 350))), 20);

// A useless compass (what the simulator reports) must not win.
const blind = resolveHeading({
    compass: { trueHeading: -1, magHeading: -1, accuracy: 0 },
    fix: { ...move(start, 0, 8), speed: 1.3, course: null },
    previous: start,
    lastHeading: null,
});
assert.equal(blind.source, 'track');
near(blind.heading ?? -1, 0, 2, 'fake compass from the walk');

// Course, when the simulated route provides one, is the heading.
const routed = resolveHeading({
    compass: null,
    fix: { ...move(start, 90, 5), speed: 1.4, course: 90 },
    previous: start,
    lastHeading: null,
});
assert.equal(routed.source, 'course');
near(routed.heading ?? -1, 90, 0.1, 'route course');

// A calibrated phone compass beats the direction of travel.
const phone = resolveHeading({
    compass: { trueHeading: 210, magHeading: 198, accuracy: 3 },
    fix: { ...move(start, 90, 5), speed: 1.4, course: 90 },
    previous: start,
    lastHeading: 90,
});
assert.equal(phone.source, 'compass');
near(phone.heading ?? -1, 210, 0.1, 'phone compass');

const magnetic = resolveHeading({
    compass: { trueHeading: -1, magHeading: 12, accuracy: 2 },
    fix: null,
    previous: null,
    lastHeading: null,
});
assert.equal(magnetic.source, 'compass');
near(magnetic.heading ?? -1, 12, 0.1, 'magnetic fallback');

// Standing still with a bad compass holds the last heading instead of spinning.
const held = resolveHeading({
    compass: { trueHeading: 40, magHeading: 40, accuracy: 0 },
    fix: { ...start, speed: 0, course: -1 },
    previous: start,
    lastHeading: 180,
});
assert.equal(held.source, 'hold');
near(held.heading ?? -1, 180, 0.1, 'held heading');

const walker = makeWalker(start);
// No course: the fake compass is the track of the simulated walk.
for (let i = 0; i < 30; i++) stepWalk(walker, 0, 1.2, null);
near(walker.target ?? -1, 0, 3, 'walking north, fake heading');
assert.ok(distanceM(walker.cam, walker.pos) < 1.5, `camera lost the walker going north (${distanceM(walker.cam, walker.pos).toFixed(2)} m)`);
near(walker.cam.heading, 0, 2, 'north-up camera');
near(beamScreenAngle(walker.shown ?? 0, walker.cam.heading), 0, 4, 'beam points up while walking north');

for (let i = 0; i < 30; i++) stepWalk(walker, 90, 1.2, null);
near(walker.target ?? -1, 90, 4, 'turned east, fake heading');
assert.ok(distanceM(walker.cam, walker.pos) < 1.5, `camera lost the walker going east (${distanceM(walker.cam, walker.pos).toFixed(2)} m)`);
near(walker.cam.heading, 0, 2, 'north-up stays north');
near(beamScreenAngle(walker.shown ?? 0, walker.cam.heading), 90, 6, 'beam points east on a north-up map');

walker.facingUp = true;
settle(walker, 40);
near(walker.cam.heading, walker.shown ?? 90, 4, 'facing-up camera');
near(beamScreenAngle(walker.shown ?? 0, walker.cam.heading), 0, 4, 'beam points up when the map turns with you');
assert.ok(distanceM(walker.cam, walker.pos) < 1.5, 'camera stayed with the walker in facing-up');

// Phone arrives: compass says 210 while the walk is still east.
walker.compass = { trueHeading: 210, magHeading: 198, accuracy: 3 };
const turned = resolveHeading({
    compass: walker.compass,
    fix: { ...walker.pos, speed: 1.2, course: 90 },
    previous: walker.pos,
    lastHeading: walker.target,
});
assert.equal(turned.source, 'compass');
walker.target = turned.heading;
settle(walker, 50);
near(walker.shown ?? -1, 210, 3, 'smoothed phone heading');
near(walker.cam.heading, 210, 4, 'facing-up follows the phone');
near(beamScreenAngle(walker.shown ?? 0, walker.cam.heading), 0, 4, 'beam stays up as the map rotates');

walker.facingUp = false;
settle(walker, 50);
near(walker.cam.heading, 0, 3, 'back to north-up');
near(beamScreenAngle(walker.shown ?? 0, walker.cam.heading), 210, 5, 'beam shows the phone heading on a north-up map');

const lag = distanceM(walker.cam, walker.pos);
console.log([
    'simulated walk ok',
    `fake compass north then east, camera lag ${lag.toFixed(2)} m`,
    'facing-up beam stays up, north-up beam matches the phone at 210°',
].join(' — '));