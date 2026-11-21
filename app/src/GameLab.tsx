/**
 * TEMPORARY test screen for the backend (Steven's real screens replace it).
 * Host or join a room, add bots, start a round, see your role, and bite/heal
 * using real Bluetooth or fake proximity from the debug buttons.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Zone } from '../../shared/protocol';
import {
    emitAck,
    hostGame,
    joinGame,
    leaveGame,
    playerId,
    send,
    useGameEvent,
    useGameStore,
    useServerNow,
} from './net/client';
import { useProxReporter } from './net/useProxReporter';

export default function GameLab() {
    const { view, connected, url } = useGameStore();
    const now = useServerNow();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [msg, setMsg] = useState('');
    const [bleStatus, setBleStatus] = useState('');
    const [progress, setProgress] = useState('');

    useProxReporter(setBleStatus);

    useGameEvent(
        'notice',
        useCallback((n) => {
            setMsg(n.text);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }, []),
    );
    useGameEvent(
        'progress',
        useCallback((p) => setProgress(`${p.kind} in progress on #${p.targetBleId}…`), []),
    );
    useGameEvent(
        'end',
        useCallback((e) => setProgress(e.ok ? `${e.kind} worked!` : `${e.kind} failed: ${e.reason ?? ''}`), []),
    );

    const run = async (fn: () => Promise<unknown>) => {
        try {
            setMsg('');
            await fn();
        } catch (e: any) {
            setMsg(e.message);
        }
    };

    // ---------- Not in a room ----------
    if (!view) {
        return (
            <ScrollView contentContainerStyle={s.page}>
                <Text style={s.title}>PULSE · Game Lab</Text>
                <Text style={s.dim}>
                    Server {url} · {connected ? '🟢 connected' : '🔴 not connected'}
                </Text>
                <TextInput style={s.input} placeholder="Your name" placeholderTextColor="#666" value={name} onChangeText={setName} />
                <Btn label="Host a game" onPress={() => run(() => hostGame(name || 'Host'))} />
                <TextInput
                    style={s.input}
                    placeholder="Room code"
                    placeholderTextColor="#666"
                    autoCapitalize="characters"
                    value={code}
                    onChangeText={setCode}
                />
                <Btn label="Join" onPress={() => run(() => joinGame(name || 'Player', code))} />
                {!!msg && <Text style={s.err}>{msg}</Text>}
            </ScrollView>
        );
    }

    const me = view.players.find((p) => p.id === view.youId);
    const isHost = view.hostId === view.youId;
    const secsLeft = (t: number | null) => (t ? Math.max(0, Math.ceil((t - now) / 1000)) : 0);
    const role = view.me?.role;
    const canAct = view.phase === 'playing' && view.me?.status === 'active' && (role === 'infected' || role === 'doctor');

    return (
        <ScrollView contentContainerStyle={s.page}>
            <Text style={s.title}>Room {view.code}</Text>
            <Text style={s.dim}>
                {view.phase.toUpperCase()} · {connected ? '🟢' : '🔴 reconnecting…'} · you are {me?.name}
                {isHost ? ' (host)' : ''}
            </Text>

            {/* ---------- Lobby ---------- */}
            {view.phase === 'lobby' && (
                <>
                    {view.players.map((p) => (
                        <Text key={p.id} style={s.row}>
                            {p.isHost ? '👑 ' : p.ready ? '✅ ' : '⏳ '}
                            {p.name}
                            {p.isBot ? ' 🤖' : ''}
                            {p.connected ? '' : ' (offline)'}
                        </Text>
                    ))}
                    {!isHost && <Btn label={me?.ready ? 'Not ready' : 'Ready'} onPress={() => send('lobby:ready', { ready: !me?.ready })} />}
                    {view.debugEnabled && <Btn label="+ Add 3 bots" onPress={() => send('debug:addBots', { count: 3 })} />}
                    {isHost && (
                        <Btn
                            label="Start game"
                            onPress={() => run(async () => {
                                const err = await emitAck('game:start');
                                if (err) throw new Error(err);
                            })}
                        />
                    )}
                    {view.startBlockers.map((b) => (
                        <Text key={b} style={s.dim}>
                            • {b}
                        </Text>
                    ))}
                </>
            )}

            {/* ---------- Countdown ---------- */}
            {view.phase === 'countdown' && (
                <>
                    <Text style={s.big}>Scatter! {secsLeft(view.countdownEndsAt)} s</Text>
                    {view.debugEnabled && <Btn label="Skip countdown" onPress={() => send('debug:skip')} />}
                </>
            )}

            {/* ---------- Playing ---------- */}
            {view.phase === 'playing' && view.me && (
                <>
                    <Text style={s.big}>
                        {role?.toUpperCase()} {view.me.status === 'eliminated' ? '(eliminated)' : ''}
                    </Text>
                    <Text style={s.dim}>
                        {Math.floor(secsLeft(view.endsAt) / 60)}:{String(secsLeft(view.endsAt) % 60).padStart(2, '0')} left · my
                        Bluetooth #{view.me.bleId}
                        {role === 'doctor' ? ` · heals left ${view.me.healsLeft}` : ''}
                    </Text>
                    {!view.me.roleAcked && <Btn label="Got it (hide role)" onPress={() => send('game:roleAck')} />}
                    <Text style={s.dim}>{bleStatus}</Text>
                    {!!progress && <Text style={s.row}>{progress}</Text>}

                    <Text style={s.section}>Players on radar</Text>
                    {view.radar.map((r) => {
                        const fake = view.debugProx[r.bleId];
                        return (
                            <View key={r.bleId} style={s.card}>
                                <Text style={s.row}>
                                    #{r.bleId} {r.ally ? `🧟 ${r.name}` : ''} {fake ? `· fake ${fake}` : ''}
                                </Text>
                                {canAct && (
                                    <Pressable
                                        style={({ pressed }) => [s.hold, pressed && s.holdOn]}
                                        onPressIn={() =>
                                            emitAck('action:start', { targetBleId: r.bleId }).then((err) => err && setProgress(err))
                                        }
                                        onPressOut={() => send('action:cancel')}
                                    >
                                        <Text style={s.btnText}>Hold to {role === 'doctor' ? 'heal' : 'bite'}</Text>
                                    </Pressable>
                                )}
                                {view.debugEnabled && (
                                    <View style={s.rowBtns}>
                                        {(['HOT', 'WARM', 'COLD'] as Zone[]).map((z) => (
                                            <Pressable key={z} style={s.small} onPress={() => send('debug:setProx', { targetBleId: r.bleId, zone: z })}>
                                                <Text style={s.btnText}>{z}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                    {view.debugEnabled && (
                        <>
                            <Btn label="Bots roam (random moves)" onPress={() => send('debug:botRoam', { on: true })} />
                            <Btn label="End round in 5 s" onPress={() => send('debug:skip')} />
                        </>
                    )}
                </>
            )}

            {/* ---------- Ended ---------- */}
            {view.phase === 'ended' && view.result && (
                <>
                    <Text style={s.big}>{view.result.winner === 'infected' ? '🧟 Infected win' : '🛡️ Survivors win'}</Text>
                    <Text style={s.dim}>{view.result.reason}</Text>
                    {view.result.standings.map((st) => (
                        <Text key={st.name} style={s.row}>
                            {st.name}: {st.startRole} → {st.finalRole} · bites {st.bites} · heals {st.heals}
                        </Text>
                    ))}
                    {isHost && <Btn label="Play again" onPress={() => send('game:playAgain')} />}
                </>
            )}

            {!!msg && <Text style={s.err}>{msg}</Text>}
            <Btn label="Leave room" onPress={leaveGame} />
            <Text style={s.tiny}>player id {playerId}</Text>
        </ScrollView>
    );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]} onPress={onPress}>
            <Text style={s.btnText}>{label}</Text>
        </Pressable>
    );
}

const s = StyleSheet.create({
    page: { padding: 20, paddingTop: 70, gap: 10, backgroundColor: '#0b0b0f', flexGrow: 1 },
    title: { color: '#fff', fontSize: 26, fontWeight: '800' },
    big: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 8 },
    section: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12 },
    dim: { color: '#999' },
    tiny: { color: '#555', fontSize: 11, marginTop: 20 },
    row: { color: '#ddd', fontSize: 16 },
    err: { color: '#ff6b6b' },
    input: { backgroundColor: '#1c1c24', color: '#fff', padding: 12, borderRadius: 10, fontSize: 16 },
    btn: { backgroundColor: '#e63946', padding: 14, borderRadius: 12, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '700' },
    card: { backgroundColor: '#16161d', padding: 12, borderRadius: 12, gap: 8 },
    hold: { backgroundColor: '#6a040f', padding: 16, borderRadius: 12, alignItems: 'center' },
    holdOn: { backgroundColor: '#e63946' },
    rowBtns: { flexDirection: 'row', gap: 8 },
    small: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
});