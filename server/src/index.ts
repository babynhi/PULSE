/**
 * Socket.IO wiring for the game server. Rules live in game.ts.
 *
 *   npm run dev            # http://0.0.0.0:3001, debug tools on
 *   DEBUG_TOOLS=0 npm start
 */
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';
import { GameError, Room, makeRoomCode } from './game';

const PORT = Number(process.env.PORT ?? 3001);
const DEBUG_TOOLS = process.env.DEBUG_TOOLS !== '0';

const rooms = new Map<string, Room>();
/** playerId -> socket id, for addressing one player */
const sockets = new Map<string, string>();

const http = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('access-control-allow-origin', '*');
    res.end(
        JSON.stringify({
            ok: true,
            rooms: [...rooms.values()].map((r) => ({ code: r.code, phase: r.phase, players: r.players.size })),
        }),
    );
});

const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: '*' } });

function makeRoom(code: string) {
    const room = new Room(
        code,
        {
            notice: (pid, n) => emitTo(pid, 'notice', n),
            actionProgress: (pid, p) => emitTo(pid, 'action:progress', p),
            actionEnd: (pid, p) => emitTo(pid, 'action:end', p),
        },
        DEBUG_TOOLS,
    );
    rooms.set(code, room);
    return room;
}

function emitTo<E extends keyof ServerToClient>(playerId: string, ev: E, ...args: Parameters<ServerToClient[E]>) {
    const sid = sockets.get(playerId);
    if (sid) (io.to(sid).emit as any)(ev, ...args);
}

function broadcast(room: Room) {
    const now = Date.now();
    for (const p of room.players.values()) if (!p.isBot) emitTo(p.id, 'room:state', room.viewFor(p.id, now));
    room.dirty = false;
}

function fail(e: unknown) {
    if (e instanceof GameError) return { ok: false as const, error: e.message };
    console.error(e);
    return { ok: false as const, error: 'Server error' };
}

io.on('connection', (socket: Socket<ClientToServer, ServerToClient>) => {
    const ctx = { playerId: '', code: '' };
    const room = () => rooms.get(ctx.code);

    /** Run a handler for the player's room, then push fresh state if anything changed. */
    const inRoom =
        <A extends any[]>(fn: (r: Room, ...a: A) => void, ack?: (a: any[]) => ((x: any) => void) | undefined) =>
            (...args: A) => {
                const r = room();
                const cb = ack?.(args);
                if (!r) return cb?.({ ok: false, error: 'Not in a room' });
                try {
                    fn(r, ...args);
                    cb?.({ ok: true });
                } catch (e) {
                    if (cb) cb(fail(e));
                    else if (!(e instanceof GameError)) console.error(e);
                }
                if (r.dirty) broadcast(r);
            };

    function enter(r: Room, playerId: string, name: string) {
        if (ctx.code && ctx.code !== r.code) leaveCurrent();
        r.join(playerId, name, Date.now());
        ctx.playerId = playerId;
        ctx.code = r.code;
        sockets.set(playerId, socket.id);
        broadcast(r);
    }

    function leaveCurrent() {
        const r = room();
        if (r) {
            r.leave(ctx.playerId, Date.now());
            broadcast(r);
            if (r.isEmpty()) rooms.delete(r.code);
        }
        sockets.delete(ctx.playerId);
        ctx.code = '';
    }

    socket.on('room:create', ({ playerId, name }, ack) => {
        if (!playerId) return ack({ ok: false, error: 'Missing player id' });
        const code = makeRoomCode((c) => rooms.has(c));
        enter(makeRoom(code), playerId, name);
        ack({ ok: true, code });
    });

    socket.on('room:join', ({ playerId, name, code }, ack) => {
        const r = rooms.get(String(code ?? '').trim().toUpperCase());
        if (!r) return ack({ ok: false, error: 'Room not found' });
        try {
            enter(r, playerId, name);
            ack({ ok: true, code: r.code });
        } catch (e) {
            ack(fail(e));
        }
    });

    socket.on('room:leave', (ack) => {
        leaveCurrent();
        if (typeof ack === 'function') ack();
    });

    socket.on('lobby:ready', inRoom((r, { ready }) => r.setReady(ctx.playerId, !!ready)));
    socket.on(
        'lobby:settings',
        inRoom(
            (r, { patch }) => r.updateSettings(ctx.playerId, patch ?? {}),
            (a) => a[1],
        ),
    );
    socket.on(
        'lobby:kick',
        inRoom((r, { playerId }) => {
            r.kick(ctx.playerId, playerId);
            sockets.delete(playerId);
        }),
    );
    socket.on('lobby:transferHost', inRoom((r, { playerId }) => r.transferHost(ctx.playerId, playerId)));
    socket.on(
        'lobby:addDemo',
        inRoom(
            (r) => r.addDemoPlayers(ctx.playerId, Date.now()),
            (a) => (typeof a[0] === 'function' ? a[0] : undefined),
        ),
    );
    socket.on(
        'game:start',
        inRoom(
            (r) => r.start(ctx.playerId, Date.now()),
            (a) => a[0],
        ),
    );
    socket.on('game:roleAck', inRoom((r) => r.roleAck(ctx.playerId)));
    socket.on('game:playAgain', inRoom((r) => r.playAgain(ctx.playerId)));
    socket.on('prox:report', inRoom((r, { readings }) => r.reportProx(ctx.playerId, readings ?? [], Date.now())));
    socket.on('loc:report', inRoom((r, loc) => r.reportLoc(ctx.playerId, loc ?? {}, Date.now())));
    socket.on(
        'action:start',
        inRoom(
            (r, { targetBleId }) => r.startAction(ctx.playerId, Number(targetBleId), Date.now()),
            (a) => a[1],
        ),
    );
    socket.on('action:cancel', inRoom((r) => r.cancelAction(ctx.playerId)));

    socket.on('debug:addBots', inRoom((r, { count }) => r.addBots(count, Date.now())));
    socket.on('debug:setProx', inRoom((r, { targetBleId, zone }) => r.setDebugProx(ctx.playerId, targetBleId, zone)));
    socket.on('debug:skip', inRoom((r) => r.debugSkip(Date.now())));
    socket.on(
        'debug:botRoam',
        inRoom((r, { on }) => {
            r.botRoam = !!on;
        }),
    );
    socket.on('debug:setRole', inRoom((r, { role }) => r.debugSetRole(ctx.playerId, role)));

    socket.on('disconnect', () => {
        const r = room();
        // Only mark disconnected if this socket is still the player's current one (not replaced by a rejoin).
        if (r && sockets.get(ctx.playerId) === socket.id) {
            sockets.delete(ctx.playerId);
            r.disconnect(ctx.playerId, Date.now());
            broadcast(r);
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
        r.tick(now);
        if (r.dirty) broadcast(r);
        // Drop rooms nobody has been connected to for 10 minutes.
        const anyone = [...r.players.values()].some((p) => !p.isBot && (p.connected || now - (p.disconnectedAt ?? 0) < 600_000));
        if (!anyone) rooms.delete(r.code);
    }
}, 100);

http.listen(PORT, '0.0.0.0', () => {
    console.log(`PULSE server on :${PORT} (debug tools ${DEBUG_TOOLS ? 'on' : 'off'})`);
});
