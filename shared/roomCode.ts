const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRoomCode(taken: (code: string) => boolean, rng = Math.random): string {
    let code: string;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
    } while (taken(code));
    return code;
}
