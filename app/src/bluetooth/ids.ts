// Each player broadcasts one Bluetooth ID with their player number inside it:
//   player 42  ->  "c0de002a-7a9e-4f1b-9c2d-1a2b3c4d5e6f"   (002a = 42 in hex)
// The "c0de" start and the fixed ending let us ignore every other
// Bluetooth device around (headphones, watches, etc.).

const PREFIX = 'c0de';
const SUFFIX = '-7a9e-4f1b-9c2d-1a2b3c4d5e6f';

export function idToUuid(playerNumber: number): string {
    return PREFIX + playerNumber.toString(16).padStart(4, '0') + SUFFIX;
}

/** Returns the player number, or null if this isn't a PULSE player. */
export function uuidToId(uuid: string): number | null {
    const u = uuid.toLowerCase();
    if (!u.startsWith(PREFIX) || !u.endsWith(SUFFIX)) return null;
    const n = parseInt(u.slice(4, 8), 16);
    return n > 0 ? n : null;
}