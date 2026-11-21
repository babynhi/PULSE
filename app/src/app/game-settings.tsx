import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SETTING_LIMITS } from '../../../shared/protocol';
import { type DemoSettings, useDemoSettings } from '../demo/settings';

type NumberKey = Exclude<keyof DemoSettings, 'doctorEnabled' | 'zoneEnabled'>;
type Group = 'Round' | 'Roles and actions' | 'Safe zone' | 'Radar and connection';
type Field = { key: NumberKey; label: string; unit: string; factor?: number; limits?: [number, number] };

const groups: Record<Group, Field[]> = {
  Round: [
    { key: 'durationSec', label: 'Round duration', unit: 'min', factor: 60 },
    { key: 'disperseSec', label: 'Dispersal countdown', unit: 'sec' },
  ],
  'Roles and actions': [
    { key: 'infectedCount', label: 'Starting infected', unit: 'players', limits: [1, 3] },
    { key: 'healCharges', label: 'Healing charges', unit: 'charges' },
    { key: 'biteHoldMs', label: 'Bite hold', unit: 'sec', factor: 1000 },
    { key: 'healHoldMs', label: 'Heal hold', unit: 'sec', factor: 1000 },
    { key: 'immunitySec', label: 'Post-heal immunity', unit: 'sec' },
  ],
  'Safe zone': [
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

export default function GameSettings() {
  const { settings, setSettings, canEdit } = useDemoSettings();
  const [active, setActive] = useState<Group | null>('Round');
  const [draft, setDraft] = useState<Partial<Record<NumberKey, string>>>({});
  const [doctor, setDoctor] = useState(settings.doctorEnabled);
  const [zone, setZone] = useState(settings.zoneEnabled);
  const [error, setError] = useState('');
  const leave = () => router.canGoBack() ? router.back() : router.replace('/');
  function save() {
    const next = { ...settings, doctorEnabled: doctor, zoneEnabled: zone };
    function fail(group: Group, message: string) {
      setActive(group);
      setError(message);
    }
    for (const group of groupNames) {
      if (group === 'Safe zone' && !zone) continue;
      for (const field of groups[group]) {
        const input = draft[field.key];
        if (input === undefined) continue;
        const factor = field.factor ?? 1;
        const value = Number(input) * factor;
        const [min, max] = field.limits ?? SETTING_LIMITS[field.key];
        if (!input.trim() || !Number.isInteger(value) || value < min || value > max) {
          return fail(group, field.label + ' must be between ' + min / factor + ' and ' + max / factor + ' ' + field.unit + '.');
        }
        next[field.key] = value;
      }
    }
    if (zone && next.zoneWarningSec > next.zoneShrinkSec) return fail('Safe zone', 'The warning must fit within the shrink interval.');
    if (next.pingDurationSec > next.pingIntervalSec) return fail('Radar and connection', 'Ping duration must fit within the interval.');
    setSettings(next);
    leave();
  }
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.caption}>{canEdit ? 'Changes apply to this demo round.' : 'Room settings are managed by the host.'}</Text>
    {groupNames.map(group => (
      <View key={group} style={s.section}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: active === group }}
          style={s.row} onPress={() => setActive(active === group ? null : group)}>
          <Text style={s.heading}>{group === 'Safe zone' ? 'Map and boundary' : group}</Text><Text style={s.indicator}>{active === group ? '−' : '+'}</Text>
        </Pressable>
        {active === group && <>
          {(group === 'Safe zone' || group === 'Roles and actions') && <View style={s.row}>
            <Text style={s.label}>{group === 'Safe zone' ? 'Use GPS boundary' : 'Include Doctor'}</Text>
            {canEdit ? <Switch accessibilityLabel={group === 'Safe zone' ? 'Use GPS boundary' : 'Include Doctor'}
              value={group === 'Safe zone' ? zone : doctor} onValueChange={group === 'Safe zone' ? setZone : setDoctor} /> :
              <Text style={s.value}>{(group === 'Safe zone' ? zone : doctor) ? 'On' : 'Off'}</Text>}
          </View>}
          {(group !== 'Safe zone' || zone) && groups[group].map(field => {
            const value = draft[field.key] ?? String(settings[field.key] / (field.factor ?? 1));
            return <View key={field.key} style={s.row}>
              <Text style={s.label}>{field.label}</Text>
              <View style={s.number}>{canEdit ?
                <TextInput accessibilityLabel={field.label + ' in ' + field.unit} keyboardType="decimal-pad"
                  style={s.input} value={value} selectTextOnFocus
                  onChangeText={v => { setDraft(previous => ({ ...previous, [field.key]: v })); setError(''); }} />
                : <Text style={s.value}>{value}</Text>}
                <Text style={s.caption}>{field.unit}</Text></View>
            </View>;
          })}
        </>}
      </View>
    ))}
    {error !== '' && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {canEdit && <Pressable accessibilityRole="button" style={s.save} onPress={save}>
      <Text style={s.saveLabel}>Save settings</Text>
    </Pressable>}
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 640, padding: 20, gap: 12 },
  section: { paddingHorizontal: 16, backgroundColor: '#1B2525', borderRadius: 12 },
  row: { minHeight: 56, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { color: '#F2F5ED', fontSize: 19, fontWeight: '700' },
  indicator: { color: '#BCFA74', fontSize: 24 },
  label: { color: '#F2F5ED', flexShrink: 1, fontSize: 16 },
  caption: { color: '#AFBBB6', fontSize: 15 },
  number: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { width: 66, minHeight: 44, borderWidth: 1, borderColor: '#73837D', borderRadius: 7, color: '#F2F5ED', textAlign: 'center', fontSize: 17 },
  value: { color: '#F2F5ED', fontSize: 17 },
  error: { color: '#FFB8A8', fontSize: 16 },
  save: { backgroundColor: '#BCFA74', borderRadius: 10, padding: 16, alignItems: 'center' },
  saveLabel: { color: '#152013', fontSize: 17, fontWeight: '700' },
});
