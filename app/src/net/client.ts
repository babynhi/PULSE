/**
 * One Socket.IO connection to the game server, plus React hooks that expose the
 * latest RoomView and one-off events (notices, bite/heal progress).
 */
import { defaultServerUrl } from './serverUrl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
    ActionEnd,
    ActionProgress,
    ClientToServer,
    Notice,
    RoomView,
    ServerToClient,
} from '../../../shared/protocol';

/** Stable for this app session, so a dropped connection rejoins as the same player. */
export const playerId = `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

type GameSocket = Socket<ServerToClient, ClientToServer>;

interface Store {
    url: string;
    socket: GameSocket | null;
    connected: boolean;
    view: RoomView | null;
    /** serverNow - Date.now(), to correct timers for clock skew */
    clockOffset: number;
    name: string;
    code: string | null;
    /** Why we were dropped from a room (kicked, room gone); shown on the home screen. */
    lastNotice: string;
}

const store: Store = {
    url: defaultServerUrl(),
    socket: null,
    connected: false,
    view: null,
    clockOffset: 0,
    name: '',
    code: null,
    lastNotice: '',
};
let snapshot = { ...store };
const listeners = new Set<() => void>();
const emit = () => {
    snapshot = { ...store };
    listeners.forEach((l) => l());
};

type EventMap = { notice: Notice; progress: ActionProgress; end: ActionEnd };
const eventListeners: { [K in keyof EventMap]: Set<(p: EventMap[K]) => void> } = {
    notice: new Set(),
    progress: new Set(),
    end: new Set(),
};

export function getSocket(): GameSocket {
    if (store.socket) return store.socket;
    const s: GameSocket = io(store.url, { transports: ['websocket'], reconnectionDelayMax: 2000 });
    store.socket = s;
    s.on('connect', () => {
        store.connected = true;
        emit();
        // Auto-rejoin after a drop: the server restores our role and state.
        if (store.code) s.emit('room:join', { playerId, name: store.name, code: store.code }, (res: any) => {
            // Room gone (server restarted) or game started while we were away: don't sit in a dead room.
            if (!res?.ok) {
                store.code = null;
                store.view = null;
                store.lastNotice = `You lost the room: ${res?.error ?? 'unknown error'}`;
                emit();
            }
        });
    });
    s.on('connect_error', (e) => console.warn('PULSE server connect error:', e.message));
    s.on('disconnect', () => {
        store.connected = false;
        emit();
    });
    s.on('room:state', (v) => {
        store.view = v;
        // Take the code from the server too, so auto-rejoin works even if the create/join ack was late.
        store.code = v.code;
        store.clockOffset = v.serverNow - Date.now();
        emit();
    });
    s.on('notice', (n) => {
        if (n.kind === 'kicked') {
            store.code = null;
            store.view = null;
            store.lastNotice = n.text;
            emit();
        }
        eventListeners.notice.forEach((l) => l(n));
    });
    s.on('action:progress', (p) => eventListeners.progress.forEach((l) => l(p)));
    s.on('action:end', (p) => eventListeners.end.forEach((l) => l(p)));
    return s;
}

export function setServerUrl(url: string) {
    store.url = url.trim();
    store.socket?.disconnect();
    store.socket = null;
    getSocket();
    emit();
}

export function useGameStore() {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => snapshot,
    );
}

export function useGameEvent<K extends keyof EventMap>(kind: K, fn: (p: EventMap[K]) => void) {
    useEffect(() => {
        const set = eventListeners[kind] as Set<(p: EventMap[K]) => void>;
        set.add(fn);
        return () => {
            set.delete(fn);
        };
    }, [kind, fn]);
}

/** Server time now, in ms. Re-renders every `everyMs`. */
export function useServerNow(everyMs = 250) {
    const [now, setNow] = useState(() => Date.now() + store.clockOffset);
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now() + store.clockOffset), everyMs);
        return () => clearInterval(t);
    }, [everyMs]);
    return now;
}

function withTimeout<T>(fn: (cb: (r: T) => void) => void, ms = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Can’t reach the game server')), ms);
        fn((r) => {
            clearTimeout(t);
            resolve(r);
        });
    });
}

export async function hostGame(name: string) {
    const s = getSocket();
    store.name = name;
    store.lastNotice = '';
    // Long timeout: a sleeping Render server can take ~60 s to wake up.
    const res = await withTimeout<any>((cb) => s.emit('room:create', { playerId, name }, cb), 75000);
    if (!res.ok) throw new Error(res.error);
    store.name = name;
    store.code = res.code;
    emit();
}

export async function joinGame(name: string, code: string) {
    const s = getSocket();
    store.name = name;
    store.lastNotice = '';
    const res = await withTimeout<any>((cb) => s.emit('room:join', { playerId, name, code }, cb), 75000);
    if (!res.ok) throw new Error(res.error);
    store.name = name;
    store.code = res.code;
    emit();
}

export function clearLastNotice() {
    store.lastNotice = '';
    emit();
}

export function leaveGame() {
    store.socket?.emit('room:leave');
    store.code = null;
    store.view = null;
    emit();
}

/** Fire-and-forget emit; for calls with an ack, use emitAck. */
export function send<E extends keyof ClientToServer>(ev: E, ...args: Parameters<ClientToServer[E]>) {
    (getSocket().emit as any)(ev, ...args);
}

export function emitAck(ev: 'game:start' | 'action:start' | 'lobby:settings', payload?: any): Promise<string | null> {
    return withTimeout<any>((cb) =>
        payload === undefined ? (getSocket().emit as any)(ev, cb) : (getSocket().emit as any)(ev, payload, cb),
    15000).then(
        (r) => (r.ok ? null : r.error),
        (e) => e.message,
    );
}
