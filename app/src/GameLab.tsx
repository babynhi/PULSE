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
import { FieldChoice, FieldDisclosure, fieldStyles, MenuItem, party } from './ui/Menu';
import { useProxReporter } from './net/useProxReporter';

export default function GameLab() {
    const { view, connected, url } = useGameStore();
    const now = useServerNow();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [msg, setMsg] = useState('');
    const [bleStatus, setBleStatus] = useState('');
    const [progress, setProgress] = useState('');
    const [showDebug, setShowDebug] = useState(false);

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
            <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content} keyboardShouldPersistTaps="handled">
                <Text style={fieldStyles.title}>PULSE · Game Lab</Text>
                <Text style={fieldStyles.muted}>
                    Server {url} · {connected ? '🟢 connected' : '🔴 not connected'}
                </Text>
                <TextInput style={fieldStyles.input} accessibilityLabel="Your name" placeholder="Your name" placeholderTextColor={party.muted} value={name} onChangeText={setName} />
                <MenuItem label="Host a game" onPress={() => run(() => hostGame(name || 'Host'))} />
                <TextInput
                    style={fieldStyles.input}
                    accessibilityLabel="Room code" placeholder="Room code"
                    placeholderTextColor={party.muted}
                    autoCapitalize="characters"
                    value={code}
                    onChangeText={setCode}
                />
                <MenuItem label="Join" onPress={() => run(() => joinGame(name || 'Player', code))} />
                {!!msg && <Text style={fieldStyles.error}>{msg}</Text>}
            </ScrollView>
        );
    }

    const me = view.players.find((p) => p.id === view.youId);
    const isHost = view.hostId === view.youId;
    const secsLeft = (t: number | null) => (t ? Math.max(0, Math.ceil((t - now) / 1000)) : 0);
    const role = view.me?.role;
    const canAct = view.phase === 'playing' && view.me?.status === 'active' && (role === 'infected' || role === 'doctor');

    return (
        <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content} keyboardShouldPersistTaps="handled">
            <Text style={fieldStyles.title}>Room {view.code}</Text>
            <Text style={fieldStyles.muted}>
                {view.phase.toUpperCase()} · {connected ? '🟢' : '🔴 reconnecting…'} · you are {me?.name}
                {isHost ? ' (host)' : ''}
            </Text>

            {/* ---------- Lobby ---------- */}
            {view.phase === 'lobby' && (
                <>
                    {view.players.map((p) => (
                        <Text key={p.id} style={fieldStyles.body}>
                            {p.isHost ? '👑 ' : p.ready ? '✅ ' : '⏳ '}
                            {p.name}
                            {p.isBot ? ' 🤖' : ''}
                            {p.connected ? '' : ' (offline)'}
                        </Text>
                    ))}
                    {!isHost && <MenuItem label={me?.ready ? 'Not ready' : 'Ready'} onPress={() => send('lobby:ready', { ready: !me?.ready })} />}
                    {view.debugEnabled && <MenuItem secondary label="+ Add 3 bots" onPress={() => send('debug:addBots', { count: 3 })} />}
                    {isHost && (
                        <MenuItem
                            label="Start game"
                            onPress={() => run(async () => {
                                const err = await emitAck('game:start');
                                if (err) throw new Error(err);
                            })}
                        />
                    )}
                    {view.startBlockers.map((b) => (
                        <Text key={b} style={fieldStyles.muted}>
                            • {b}
                        </Text>
                    ))}
                </>
            )}

            {/* ---------- Countdown ---------- */}
            {view.phase === 'countdown' && (
                <>
                    <Text style={fieldStyles.metric}>Scatter! {secsLeft(view.countdownEndsAt)} s</Text>
                    {view.debugEnabled && <MenuItem secondary label="Skip countdown" onPress={() => send('debug:skip')} />}
                </>
            )}

            {/* ---------- Playing ---------- */}
            {view.phase === 'playing' && view.me && (
                <>
                    <Text style={fieldStyles.metric}>
                        {role?.toUpperCase()} {view.me.status === 'eliminated' ? '(eliminated)' : ''}
                    </Text>
                    <Text style={fieldStyles.muted}>
                        {Math.floor(secsLeft(view.endsAt) / 60)}:{String(secsLeft(view.endsAt) % 60).padStart(2, '0')} left · my
                        Bluetooth #{view.me.bleId}
                        {role === 'doctor' ? ` · heals left ${view.me.healsLeft}` : ''}
                    </Text>
                    {!view.me.roleAcked && <MenuItem label="Got it (hide role)" onPress={() => send('game:roleAck')} />}
                    <Text style={fieldStyles.muted}>{bleStatus}</Text>
                    {!!progress && <Text style={fieldStyles.body}>{progress}</Text>}

                    <Text style={fieldStyles.heading}>Players on radar</Text>
                    {view.debugEnabled && (
                        <FieldDisclosure label="Debug controls" expanded={showDebug}
                            onPress={() => setShowDebug(!showDebug)} />
                    )}
                    {view.radar.map((r) => {
                        const fake = view.debugProx[r.bleId];
                        return (
                            <View key={r.bleId} style={fieldStyles.panel}>
                                <Text style={fieldStyles.body}>
                                    #{r.bleId} {r.ally ? `🧟 ${r.name}` : ''} {fake ? `· fake ${fake}` : ''}
                                </Text>
                                {canAct && (
                                    <Pressable
                                        accessibilityRole="button"
                                        style={({ pressed }) => [fieldStyles.panel, s.hold, pressed && s.holdOn]}
                                        onPressIn={() =>
                                            emitAck('action:start', { targetBleId: r.bleId }).then((err) => err && setProgress(err))
                                        }
                                        onPressOut={() => send('action:cancel')}
                                    >
                                        <Text style={fieldStyles.label}>Hold to {role === 'doctor' ? 'heal' : 'bite'}</Text>
                                    </Pressable>
                                )}
                                {view.debugEnabled && showDebug && (
                                    <View style={fieldStyles.row}>
                                        {(['HOT', 'WARM', 'COLD'] as Zone[]).map((z) => (
                                            <FieldChoice key={z} label={z} selected={fake === z}
                                                onPress={() => send('debug:setProx', { targetBleId: r.bleId, zone: z })} />
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                    {view.debugEnabled && showDebug && (
                        <>
                            <MenuItem secondary label="Bots roam (random moves)" onPress={() => send('debug:botRoam', { on: true })} />
                            <MenuItem secondary label="End round in 5 s" onPress={() => send('debug:skip')} />
                        </>
                    )}
                </>
            )}

            {/* ---------- Ended ---------- */}
            {view.phase === 'ended' && view.result && (
                <>
                    <Text style={fieldStyles.metric}>{view.result.winner === 'infected' ? '🧟 Infected win' : '🛡️ Survivors win'}</Text>
                    <Text style={fieldStyles.muted}>{view.result.reason}</Text>
                    {view.result.standings.map((st) => (
                        <Text key={st.name} style={fieldStyles.body}>
                            {st.name}: {st.startRole} → {st.finalRole} · bites {st.bites} · heals {st.heals}
                        </Text>
                    ))}
                    {isHost && <MenuItem label="Play again" onPress={() => send('game:playAgain')} />}
                </>
            )}

            {!!msg && <Text style={fieldStyles.error}>{msg}</Text>}
            <MenuItem secondary label="Leave room" onPress={leaveGame} />
            <Text style={fieldStyles.muted}>player id {playerId}</Text>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    hold: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: party.orange },
    holdOn: { backgroundColor: party.lime },
});
