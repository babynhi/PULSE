import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SETTING_LIMITS, type Settings } from '../../../shared/protocol';
import type { DemoSettings } from '../demo/settings';
import { formatDuration } from '../ui/formatDuration';
import {
  FieldDisclosure, FieldToggle, fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe,
} from '../ui/Menu';

type Values = Settings & Partial<Omit<DemoSettings, keyof Settings>>;
type NumberKey = Exclude<keyof Values, 'doctorEnabled' | 'zoneEnabled'>;
type Group = 'Round' | 'Roles and actions' | 'Map and boundary' | 'Radar and connection';
type Field = { key: NumberKey; label: string; unit: string; factor?: number; limits?: [number, number]; doctorOnly?: boolean };

const groups: Record<Group, Field[]> = {
  Round: [
    { key: 'durationSec', label: 'Round duration', unit: 'min', factor: 60 },
    { key: 'disperseSec', label: 'Dispersal countdown', unit: 'sec' },
  ],
  'Roles and actions': [
    { key: 'infectedCount', label: 'Starting infected', unit: 'players' },
    { key: 'biteHoldMs', label: 'Bite hold', unit: 'sec', factor: 1000 },
    { key: 'healCharges', label: 'Healing charges', unit: 'charges', doctorOnly: true },
    { key: 'healHoldMs', label: 'Heal hold', unit: 'sec', factor: 1000, doctorOnly: true },
    { key: 'immunitySec', label: 'Post-heal immunity', unit: 'sec', doctorOnly: true },
  ],
  'Map and boundary': [
    { key: 'zoneRadiusM', label: 'Starting radius', unit: 'm', limits: [1, 10000] },
    { key: 'zoneShrinkSec', label: 'Shrink interval', unit: 'sec', limits: [1, 3600] },
    { key: 'zoneWarningSec', label: 'Shrink warning', unit: 'sec', limits: [0, 3600] },
    { key: 'zoneGraceSec', label: 'Time to return', unit: 'sec', limits: [1, 300] },
  ],
  'Radar and connection': [
    { key: 'pingIntervalSec', label: 'Ping interval', unit: 'sec', limits: [1, 3600] },
    { key: 'pingDurationSec', label: 'Ping duration', unit: 'sec', limits: [1, 30] },
    { key: 'reconnectSec', label: 'Reconnection window', unit: 'sec' },
  ],
};
const groupNames = Object.keys(groups) as Group[];

function summary(group: Group, v: Values) {
  switch (group) {
    case 'Round':
      return formatDuration(v.durationSec) + ' round · ' + formatDuration(v.disperseSec) + ' to disperse';
    case 'Roles and actions':
      return v.infectedCount + ' infected · ' + (v.doctorEnabled
        ? 'Doctor with ' + v.healCharges + (v.healCharges === 1 ? ' heal' : ' heals') : 'Doctor off');
    case 'Map and boundary':
      if (v.zoneRadiusM === undefined) return 'Open play · No GPS boundary';
      return v.zoneEnabled && v.zoneShrinkSec !== undefined
        ? v.zoneRadiusM + ' m radius · shrinks every ' + formatDuration(v.zoneShrinkSec) : 'Boundary off';
    case 'Radar and connection':
      return (v.pingIntervalSec === undefined ? 'Bluetooth · ' : 'Pings every ' + formatDuration(v.pingIntervalSec) + ' · ') +
        formatDuration(v.reconnectSec) + ' to reconnect';
  }
}

type SettingsProps = {
  settings: Values;
  canEdit: boolean;
  maxStartingInfected?: number;
  onSave: (patch: Partial<Values>) => Promise<void> | void;
  onClose: () => void;
};
type FieldError = { key: NumberKey; group: Group; message: string };

export function RoomSettingsForm(props: SettingsProps) {
  return <SettingsEditor key={props.canEdit ? 'host' : 'guest'} {...props} />;
}

function SettingsEditor({ settings, canEdit, maxStartingInfected, onSave, onClose }: SettingsProps) {
  const [active, setActive] = useState<Group | null>(null);
  const [draft, setDraft] = useState<Partial<Record<NumberKey, string>>>({});
  const [switches, setSwitches] = useState<Partial<Pick<Settings, 'doctorEnabled' | 'zoneEnabled'>>>({});
  const [error, setError] = useState<FieldError | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputs = useRef<Partial<Record<NumberKey, ComponentRef<typeof TextInput> | null>>>({});
  const mounted = useRef(true);
  const headerHeight = useHeaderHeight();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (error) inputs.current[error.key]?.focus();
  }, [error]);

  const next = { ...settings, ...switches };
  const patch: Partial<Values> = {};
  if (next.doctorEnabled !== settings.doctorEnabled) patch.doctorEnabled = next.doctorEnabled;
  if (next.zoneEnabled !== settings.zoneEnabled) patch.zoneEnabled = next.zoneEnabled;
  const hasMap = settings.zoneRadiusM !== undefined;
  function fields(group: Group) {
    if (group === 'Map and boundary' && !next.zoneEnabled) return [];
    return groups[group].filter(field => settings[field.key] !== undefined && (!field.doctorOnly || next.doctorEnabled));
  }
  let invalid: FieldError | undefined;
  for (const group of groupNames) {
    for (const field of fields(group)) {
      const raw = draft[field.key];
      if (raw === undefined) continue;
      const factor = field.factor ?? 1;
      const parsed = Number(raw.trim().replace(',', '.')) * factor;
      const value = Math.round(parsed);
      const [min, upperLimit] = field.limits ?? SETTING_LIMITS[field.key];
      const max = field.key === 'infectedCount' && maxStartingInfected !== undefined ? Math.min(maxStartingInfected, upperLimit) : upperLimit;
      if (!raw.trim() || !Number.isFinite(parsed) || Math.abs(parsed - value) > 1e-7 || value < min || value > max) {
        const range = min / factor + ' to ' + max / factor + ' ' + field.unit;
        const message = factor === 1 ? 'Enter a whole number from ' + range + '.' : 'Enter a value from ' + range + '.';
        invalid ??= { group, key: field.key, message };
      } else if (value !== settings[field.key]) {
        next[field.key] = value;
        patch[field.key] = value;
      }
    }
  }
  if (next.zoneEnabled && next.zoneWarningSec !== undefined && next.zoneShrinkSec !== undefined && next.zoneWarningSec > next.zoneShrinkSec) {
    invalid ??= { group: 'Map and boundary', key: 'zoneWarningSec', message: 'The warning must fit within the shrink interval.' };
  }
  if (next.pingDurationSec !== undefined && next.pingIntervalSec !== undefined && next.pingDurationSec > next.pingIntervalSec) {
    invalid ??= { group: 'Radar and connection', key: 'pingDurationSec', message: 'Ping duration must fit within the interval.' };
  }
  const dirty = !!invalid || Object.keys(patch).length > 0;
  function changed() {
    setError(null);
    setSaveError('');
  }
  async function save() {
    if (!canEdit || saving || !dirty) return;
    if (invalid) {
      setActive(invalid.group);
      setError(invalid);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await onSave(patch);
      if (mounted.current) onClose();
    } catch (cause) {
      if (mounted.current) setSaveError(cause instanceof Error ? cause.message : 'Could not save. Try again.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  function toggle(label: string, key: 'zoneEnabled' | 'doctorEnabled') {
    return canEdit ? <FieldToggle label={label} value={next[key]} onValueChange={value => {
      changed();
      setSwitches(previous => ({ ...previous, [key]: value }));
    }} /> : <View style={[fieldStyles.row, s.row]}><Text style={fieldStyles.label}>{label}</Text>
      <Text style={fieldStyles.body}>{next[key] ? 'On' : 'Off'}</Text></View>;
  }

  return <KeyboardAvoidingView style={fieldStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={headerHeight}>
    <ScrollView style={fieldStyles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <TrackStripe />
      <SafeAreaView edges={['left', 'right', 'bottom']}>
        <View style={fieldStyles.content} pointerEvents={saving ? 'none' : 'auto'}>
          {!canEdit && <Text style={fieldStyles.muted}>Only the host can edit these settings.</Text>}
          {groupNames.map(group => {
            const open = active === group;
            return <View key={group} style={fieldStyles.panel}>
              <FieldDisclosure label={group} summary={open ? undefined : summary(group, next)} expanded={open}
                onPress={() => setActive(open ? null : group)} />
              {open && <View style={s.fields}>
                {group === 'Map and boundary' && (hasMap ? toggle('Use GPS boundary', 'zoneEnabled')
                  : <Text style={fieldStyles.body}>Agree on a play area together before you start. This room uses open play.</Text>)}
                {group === 'Radar and connection' && settings.pingIntervalSec === undefined &&
                  <Text style={fieldStyles.body}>Bluetooth picks up nearby players while PULSE is open.</Text>}
                {group === 'Roles and actions' && toggle('Include Doctor', 'doctorEnabled')}
                {fields(group).map(field => {
                  const value = draft[field.key] ?? String(settings[field.key]! / (field.factor ?? 1));
                  const message = error?.key === field.key ? error.message : undefined;
                  return <View key={field.key}>
                    <View style={[fieldStyles.row, s.row]}>
                      <Text style={[fieldStyles.label, s.fieldLabel]}>{field.label}</Text>
                      <View style={s.number}>{canEdit ?
                        <TextInput ref={node => { inputs.current[field.key] = node; }} accessibilityHint={message}
                          accessibilityLabel={field.label + ' in ' + field.unit} keyboardType="decimal-pad"
                          style={[fieldStyles.input, s.input, message && s.invalid]} value={value} selectTextOnFocus
                          editable={!saving} onChangeText={text => {
                            changed();
                            setDraft(previous => ({ ...previous, [field.key]: text }));
                          }} />
                        : <Text style={fieldStyles.body}>{value}</Text>}
                        <Text style={fieldStyles.muted}>{field.unit}</Text></View>
                    </View>
                    {message && <Text accessibilityRole="alert" style={fieldStyles.error}>{message}</Text>}
                  </View>;
                })}
              </View>}
            </View>;
          })}
        </View>
      </SafeAreaView>
    </ScrollView>
    {canEdit && (dirty || saving) && <SafeAreaView edges={['left', 'right', 'bottom']} style={s.footer}>
      <MenuPaper />
      <View style={s.footerAction}>
        {!!saveError && <Text accessibilityRole="alert" style={fieldStyles.error}>{saveError}</Text>}
        <MenuItem label={saving ? 'Saving…' : 'Save settings'} onPress={save} disabled={saving} busy={saving} />
      </View>
    </SafeAreaView>}
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  fields: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, paddingTop: 8 },
  row: { minHeight: 48, justifyContent: 'space-between', flexWrap: 'wrap' },
  fieldLabel: { flexShrink: 1 },
  number: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { width: 78, textAlign: 'center', paddingHorizontal: 4 },
  invalid: { borderColor: party.alert },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, backgroundColor: party.paper },
  footerAction: { width: '100%', maxWidth: fieldStyles.content.maxWidth, alignSelf: 'center', padding: menuActionLayout.inset, gap: 8 },
});
