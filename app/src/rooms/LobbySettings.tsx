/**
 * Game settings in the lobby. The host edits them (sent to the server, which clamps
 * and broadcasts); everyone else sees the same values read-only.
 */
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { SETTING_LIMITS, type RoomView, type Settings } from '../../../shared/protocol';
import { emitAck } from '../net/client';
import { C, ui } from './ui';

type NumKey = Exclude<keyof Settings, 'doctorEnabled' | 'zoneEnabled'>;
type Field = { key: NumKey; label: string; unit: string; step: number; factor?: number };

const FIELDS: Field[] = [
  { key: 'durationSec', label: 'Round length', unit: 'min', step: 60, factor: 60 },
  { key: 'disperseSec', label: 'Scatter countdown', unit: 's', step: 5 },
  { key: 'infectedCount', label: 'Starting infected', unit: '', step: 1 },
  { key: 'healCharges', label: 'Doctor heals', unit: '', step: 1 },
  { key: 'biteHoldMs', label: 'Bite hold time', unit: 's', step: 500, factor: 1000 },
  { key: 'healHoldMs', label: 'Heal hold time', unit: 's', step: 500, factor: 1000 },
  { key: 'immunitySec', label: 'Immunity after cure', unit: 's', step: 5 },
  { key: 'reconnectSec', label: 'Reconnect window', unit: 's', step: 5 },
  { key: 'maxPlayers', label: 'Max players', unit: '', step: 1 },
];

const ZONE_FIELDS: Field[] = [
  { key: 'zoneStartRadiusM', label: 'Zone start size', unit: 'm', step: 25 },
  { key: 'zoneShrinkSec', label: 'Zone shrinks every', unit: 'min', step: 30, factor: 60 },
  { key: 'zoneGraceSec', label: 'Time to get back in', unit: 's', step: 1 },
];

export function LobbySettings({ view, isHost }: { view: RoomView; isHost: boolean }) {
  const [error, setError] = useState('');
  const [open, setOpen] = useState(isHost);
  const s = view.settings;
  const changed = new Set(view.changedKeys);

  async function patch(p: Partial<Settings>) {
    setError('');
    const err = await emitAck('lobby:settings', { patch: p });
    if (err) setError(err);
  }

  const show = (f: Field) => {
    const v = s[f.key] / (f.factor ?? 1);
    return `${Number.isInteger(v) ? v : v.toFixed(1)}${f.unit ? ' ' + f.unit : ''}`;
  };

  return (
    <View style={ui.card}>
      <Pressable onPress={() => setOpen(!open)} style={row} accessibilityRole="button">
        <Text style={[ui.label, { fontSize: 18 }]}>Game settings</Text>
        <Text style={ui.muted}>{open ? 'Hide' : isHost ? 'Edit' : 'Show'}</Text>
      </Pressable>
      {!open && (
        <Text style={ui.muted}>
          {show(FIELDS[0])} · {s.infectedCount} infected · doctor {s.doctorEnabled ? 'on' : 'off'} · zone {s.zoneEnabled ? (s.zoneStartRadiusM ? `${s.zoneStartRadiusM} m` : 'on') : 'off'}
        </Text>
      )}
      {open && (
        <>
          {FIELDS.map((f) => {
            const [min, max] = SETTING_LIMITS[f.key] ?? [0, Infinity];
            const v = s[f.key];
            if (f.key === 'healCharges' && !s.doctorEnabled) return null;
            if ((f.key === 'healHoldMs') && !s.doctorEnabled) return null;
            return (
              <View key={f.key} style={[row, changed.has(f.key) && !isHost && flash]}>
                <Text style={label}>{f.label}</Text>
                {isHost ? (
                  <View style={stepper}>
                    <Step text="−" disabled={v <= min} onPress={() => patch({ [f.key]: Math.max(min, v - f.step) })} />
                    <Text style={value}>{show(f)}</Text>
                    <Step text="+" disabled={v >= max} onPress={() => patch({ [f.key]: Math.min(max, v + f.step) })} />
                  </View>
                ) : (
                  <Text style={value}>{show(f)}</Text>
                )}
              </View>
            );
          })}
          <View style={[row, changed.has('doctorEnabled') && !isHost && flash]}>
            <Text style={label}>Doctor</Text>
            {isHost ? (
              <Switch value={s.doctorEnabled} onValueChange={(on) => patch({ doctorEnabled: on })}
                trackColor={{ true: C.red, false: C.line }} />
            ) : (
              <Text style={value}>{s.doctorEnabled ? 'On' : 'Off'}</Text>
            )}
          </View>
          <View style={[row, changed.has('zoneEnabled') && !isHost && flash]}>
            <Text style={label}>Shrinking safe zone</Text>
            {isHost ? (
              <Switch value={s.zoneEnabled} onValueChange={(on) => patch({ zoneEnabled: on })}
                trackColor={{ true: C.red, false: C.line }} />
            ) : (
              <Text style={value}>{s.zoneEnabled ? 'On' : 'Off (house party)'}</Text>
            )}
          </View>
          {s.zoneEnabled && ZONE_FIELDS.filter((f) => typeof s[f.key] === 'number').map((f) => {
            const [min, max] = SETTING_LIMITS[f.key] ?? [0, Infinity];
            const v = s[f.key];
            return (
              <View key={f.key} style={[row, changed.has(f.key) && !isHost && flash]}>
                <Text style={label}>{f.label}</Text>
                {isHost ? (
                  <View style={stepper}>
                    <Step text="−" disabled={v <= min} onPress={() => patch({ [f.key]: Math.max(min, v - f.step) })} />
                    <Text style={value}>{show(f)}</Text>
                    <Step text="+" disabled={v >= max} onPress={() => patch({ [f.key]: Math.min(max, v + f.step) })} />
                  </View>
                ) : (
                  <Text style={value}>{show(f)}</Text>
                )}
              </View>
            );
          })}
          {isHost && <Text style={[ui.muted, { fontSize: 13 }]}>Changing a setting un-readies the other players.</Text>}
        </>
      )}
      {error !== '' && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}

function Step({ text, onPress, disabled }: { text: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button"
      accessibilityLabel={text === '+' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [stepBtn, (disabled || pressed) && { opacity: 0.4 }]}>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}

const row = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 6, gap: 10, minHeight: 40 };
const flash = { backgroundColor: 'rgba(230,57,70,0.15)', borderRadius: 8 };
const label = { color: C.text, fontSize: 15, flexShrink: 1 };
const value = { color: C.text, fontSize: 15, fontWeight: '700' as const, minWidth: 64, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
const stepper = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
const stepBtn = { width: 36, height: 36, borderRadius: 10, backgroundColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const };
