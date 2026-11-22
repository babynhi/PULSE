import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SETTING_LIMITS } from '../../../shared/protocol';
import { type DemoSettings, useDemoSettings } from '../demo/settings';

import { FieldDisclosure, FieldToggle, fieldStyles, menuActionLayout, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

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
  const [error, setError] = useState<{ key: NumberKey; message: string } | null>(null);
  const inputs = useRef<Partial<Record<NumberKey, ComponentRef<typeof TextInput> | null>>>({});
  const headerHeight = useHeaderHeight();
  useEffect(() => {
    if (error) inputs.current[error.key]?.focus();
  }, [error]);
  const leave = () => router.canGoBack() ? router.back() : router.replace('/');
  function save() {
    const next = { ...settings, doctorEnabled: doctor, zoneEnabled: zone };
    function fail(group: Group, key: NumberKey, message: string) {
      setActive(group);
      setError({ key, message });
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
          return fail(group, field.key, field.label + ' must be between ' + min / factor + ' and ' + max / factor + ' ' + field.unit + '.');
        }
        next[field.key] = value;
      }
    }
    if (zone && next.zoneWarningSec > next.zoneShrinkSec) return fail('Safe zone', 'zoneWarningSec', 'The warning must fit within the shrink interval.');
    if (next.pingDurationSec > next.pingIntervalSec) return fail('Radar and connection', 'pingDurationSec', 'Ping duration must fit within the interval.');
    setSettings(next);
    leave();
  }
  return <KeyboardAvoidingView style={fieldStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={headerHeight}>
    <ScrollView style={fieldStyles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <TrackStripe />
      <View style={fieldStyles.content}>
        <Text style={fieldStyles.muted}>{canEdit ? 'Changes apply to this demo round.' : 'Room settings are managed by the host.'}</Text>
        {groupNames.map(group => (
          <View key={group} style={fieldStyles.panel}>
            <FieldDisclosure label={group === 'Safe zone' ? 'Map and boundary' : group} expanded={active === group}
              onPress={() => setActive(active === group ? null : group)} />
            {active === group && <>
              {(group === 'Safe zone' || group === 'Roles and actions') && (canEdit
                ? <FieldToggle label={group === 'Safe zone' ? 'Use GPS boundary' : 'Include Doctor'}
                    value={group === 'Safe zone' ? zone : doctor} onValueChange={group === 'Safe zone' ? setZone : setDoctor} />
                : <View style={[fieldStyles.row, s.row]}>
                    <Text style={[fieldStyles.label, s.fieldLabel]}>{group === 'Safe zone' ? 'Use GPS boundary' : 'Include Doctor'}</Text>
                    <Text style={fieldStyles.body}>{(group === 'Safe zone' ? zone : doctor) ? 'On' : 'Off'}</Text>
                  </View>)}
              {(group !== 'Safe zone' || zone) && groups[group].map(field => {
                const value = draft[field.key] ?? String(settings[field.key] / (field.factor ?? 1));
                const message = error?.key === field.key ? error.message : undefined;
                return <View key={field.key}>
                  <View style={[fieldStyles.row, s.row]}>
                    <Text style={[fieldStyles.label, s.fieldLabel]}>{field.label}</Text>
                    <View style={s.number}>{canEdit ?
                      <TextInput ref={node => { inputs.current[field.key] = node; }} accessibilityHint={message}
                        accessibilityLabel={field.label + ' in ' + field.unit} keyboardType="decimal-pad"
                        style={[fieldStyles.input, s.input, message && s.invalid]} value={value} selectTextOnFocus
                        onChangeText={v => { setDraft(previous => ({ ...previous, [field.key]: v })); if (message) setError(null); }} />
                      : <Text style={fieldStyles.body}>{value}</Text>}
                      <Text style={fieldStyles.muted}>{field.unit}</Text></View>
                  </View>
                  {message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={fieldStyles.error}>{message}</Text>}
                </View>;
              })}
            </>}
          </View>
        ))}
      </View>
    </ScrollView>
    {canEdit && <SafeAreaView edges={['bottom']} style={s.footer}>
      <MenuPaper />
      <View style={s.footerAction}><MenuItem label="Save settings" onPress={save} /></View>
    </SafeAreaView>}
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  row: { minHeight: 48, justifyContent: 'space-between', flexWrap: 'wrap' },
  fieldLabel: { flexShrink: 1 },
  number: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { width: 78, textAlign: 'center', paddingHorizontal: 4 },
  invalid: { borderColor: party.alert },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: party.line, backgroundColor: party.paper },
  footerAction: { width: '100%', maxWidth: fieldStyles.content.maxWidth, alignSelf: 'center', padding: menuActionLayout.inset },
});
