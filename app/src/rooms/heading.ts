/**
 * Compass and camera math for the round map.
 *
 * A phone uses the magnetometer. The iOS simulator has no compass, so a walk
 * falls back to GPS course, then to the bearing between fixes. That fallback
 * is what a simulated walk on a Mac can exercise.
 */

export type LatLng = { latitude: number; longitude: number };

export type CameraState = {
    latitude: number;
    longitude: number;
    heading: number;
};

/** Expo heading sample. `accuracy` is 0–3 (none → high), not degrees of error. */
export type CompassSample = {
    trueHeading: number;
    magHeading: number;
    accuracy: number;
};

export type GeoFix = LatLng & {
    /** Metres per second. Negative or null means the platform has no speed. */
    speed: number | null;
    /** Direction of travel, degrees clockwise from true north. Negative means none. */
    course: number | null;
};

export type HeadingSource = 'compass' | 'course' | 'track' | 'hold' | 'none';

const TRACK_MIN_M = 3;
const COURSE_MIN_SPEED = 0.5;

export type HeadingTrack = {
    /** Fix the current travel bearing is measured from. */
    anchor: LatLng | null;
    heading: number | null;
};

export function normalizeDeg(deg: number): number {
    const wrapped = deg % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Smallest signed turn from `from` to `to`, in degrees (-180, 180]. */
export function angleDelta(from: number, to: number): number {
    return ((to - from + 540) % 360) - 180;
}

export function lerpAngle(from: number, to: number, t: number): number {
    return normalizeDeg(from + angleDelta(from, to) * t);
}

export function smoothHeading(current: number | null, target: number | null, t: number): number | null {
    if (target == null) return current;
    if (current == null) return normalizeDeg(target);
    return lerpAngle(current, target, t);
}

/** Degrees clockwise from true north, or null when the compass cannot be trusted. */
export function compassDegrees(sample: CompassSample | null): number | null {
    if (!sample || sample.accuracy < 1 || sample.accuracy > 3) return null;
    if (sample.trueHeading >= 0) return normalizeDeg(sample.trueHeading);
    if (sample.magHeading >= 0) return normalizeDeg(sample.magHeading);
    return null;
}

export function distanceM(a: LatLng, b: LatLng): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
        + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bearing from `from` to `to`, degrees clockwise from true north. */
export function bearingDeg(from: LatLng, to: LatLng): number {
    const rad = Math.PI / 180;
    const y = Math.sin((to.longitude - from.longitude) * rad) * Math.cos(to.latitude * rad);
    const x = Math.cos(from.latitude * rad) * Math.sin(to.latitude * rad)
        - Math.sin(from.latitude * rad) * Math.cos(to.latitude * rad) * Math.cos((to.longitude - from.longitude) * rad);
    return normalizeDeg(Math.atan2(y, x) / rad);
}

/**
 * Prefer the phone compass. Without one (the simulator), use the direction of
 * travel, then the bearing of a real step, then whatever we last trusted.
 */
export function resolveHeading(input: {
    compass: CompassSample | null;
    fix: GeoFix | null;
    previous: LatLng | null;
    lastHeading: number | null;
}): { heading: number | null; source: HeadingSource } {
    const fromCompass = compassDegrees(input.compass);
    if (fromCompass != null) return { heading: fromCompass, source: 'compass' };

    const fix = input.fix;
    if (fix) {
        const speed = fix.speed != null && fix.speed >= 0 ? fix.speed : 0;
        if (fix.course != null && fix.course >= 0 && speed >= COURSE_MIN_SPEED) {
            return { heading: normalizeDeg(fix.course), source: 'course' };
        }
        if (input.previous && distanceM(input.previous, fix) >= TRACK_MIN_M) {
            return { heading: bearingDeg(input.previous, fix), source: 'track' };
        }
    }

    if (input.lastHeading != null) return { heading: normalizeDeg(input.lastHeading), source: 'hold' };
    return { heading: null, source: 'none' };
}

/**
 * One smooth-follow step. Facing-up eases the camera heading onto the device
 * heading; north-up eases it back to 0. Position eases toward the player.
 */
export function stepCamera(
    cam: CameraState,
    target: LatLng,
    deviceHeading: number | null,
    facingUp: boolean,
    followT = 0.2,
    headingT = 0.16,
): CameraState {
    const headingTarget = facingUp && deviceHeading != null ? deviceHeading : 0;
    return {
        latitude: cam.latitude + (target.latitude - cam.latitude) * followT,
        longitude: cam.longitude + (target.longitude - cam.longitude) * followT,
        heading: lerpAngle(cam.heading, headingTarget, headingT),
    };
}

/** Screen rotation of the direction beam. 0 points up. */
export function beamScreenAngle(deviceHeading: number, cameraHeading: number): number {
    return normalizeDeg(deviceHeading - cameraHeading);
}

/**
 * Fold one compass sample or GPS fix into the heading we show.
 * Travel bearing is measured from an anchor a few metres back, so the
 * one-metre GPS updates while walking still add up to a real step.
 */
export function nextHeading(
    track: HeadingTrack,
    compass: CompassSample | null,
    fix: GeoFix | null,
): { track: HeadingTrack; source: HeadingSource } {
    const anchor = track.anchor ?? (fix ? point(fix) : null);
    const resolved = resolveHeading({ compass, fix, previous: anchor, lastHeading: track.heading });
    const heading = resolved.source === 'hold' || resolved.heading == null ? track.heading : resolved.heading;
    const moved = fix != null && anchor != null && distanceM(anchor, fix) >= TRACK_MIN_M;
    const nextAnchor = fix != null && (track.anchor == null || moved) ? point(fix) : anchor;
    return { track: { anchor: nextAnchor, heading }, source: resolved.source };
}

function point(fix: LatLng): LatLng {
    return { latitude: fix.latitude, longitude: fix.longitude };
}