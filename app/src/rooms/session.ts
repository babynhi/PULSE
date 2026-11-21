import { randomUUID } from 'expo-crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, RoomView, ServerToClient } from '../../../shared/protocol';

export type RoomEntry =
  | { mode: 'host'; name: string }
  | { mode: 'join'; name: string; code: string };

type RoomSocket = Socket<ServerToClient, ClientToServer>;

export function enterRoom(
  entry: RoomEntry,
  onState: (room: RoomView) => void,
  onFailure: (message: string, roomCode?: string) => void,
) {
  const url = process.env.EXPO_PUBLIC_SERVER_URL?.trim();
  if (!url) {
    throw new Error('The game server address is missing. Set EXPO_PUBLIC_SERVER_URL in the app configuration.');
  }

  const socket: RoomSocket = io(url, { autoConnect: false, reconnection: false, forceNew: true });
  const identity = { playerId: getPlayerId(), name: entry.name };
  let joinedCode: string | undefined;
  let closed = false;
  let receivedState = false;
  let timeout: ReturnType<typeof setTimeout>;

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    socket.removeAllListeners();
    socket.disconnect();
  }

  function fail(message: string) {
    if (closed) return;
    close();
    onFailure(message, joinedCode);
  }

  socket.on('room:state', (room) => {
    receivedState = true;
    joinedCode = room.code;
    clearTimeout(timeout);
    onState(room);
  });
  socket.on('notice', (notice) => {
    if (notice.kind === 'kicked') fail(notice.text);
  });
  socket.on('disconnect', () => fail('Connection lost. Check your connection and rejoin the room.'));
  socket.on('connect_error', () => fail('Could not reach the game server. Check your connection and try again.'));
  socket.once('connect', () => {
    const ack = (result: { ok: true; code: string } | { ok: false; error: string }) => {
      if (closed) return;
      if (!result.ok) return fail(result.error);
      joinedCode = result.code;
      if (!receivedState) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fail('The room opened, but its player list did not arrive. Rejoin to try again.'), 10000);
      }
    };
    if (entry.mode === 'host') socket.emit('room:create', identity, ack);
    else socket.emit('room:join', { ...identity, code: entry.code }, ack);
  });
  timeout = setTimeout(() => fail('The game server did not respond. Check your connection and try again.'), 12000);
  socket.connect();

  return () => {
    if (!closed && socket.connected && joinedCode) socket.emit('room:leave');
    close();
  };
}

let playerId: string | undefined;

function getPlayerId() {
  return playerId ??= randomUUID();
}
