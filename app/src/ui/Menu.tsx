import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { fieldStyles, fieldSwitchTrack, menuActionLayout, party } from './fieldDay';
export { fieldStyles, fieldSwitchTrack, menuActionLayout, party } from './fieldDay';

export function MenuPaper({ extendToFormEdges = false }: { extendToFormEdges?: boolean }) {
  return (
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, extendToFormEdges && styles.paperBleed]}>
      <Image accessible={false} source={require('../../assets/pulse/paper-fibers.png')}
        resizeMode="repeat" style={styles.paper} />
    </View>
  );
}

function ButtonPrint() {
  return <View aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, styles.buttonPrint]}>
    <Image accessible={false} source={require('../../assets/pulse/paper-fibers.png')}
      resizeMode="repeat" style={[styles.paper, styles.buttonGrain]} />
    <Image accessible={false} source={require('../../assets/pulse/button-halftone.png')}
      resizeMode="stretch" style={styles.buttonDots} />
  </View>;
}

export function PrintedHoldButton({ label, detail, progress, disabled, onPressIn, onPressOut }: {
  label: string; detail: string; progress: number; disabled: boolean; onPressIn: () => void; onPressOut: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label + ', ' + detail}
    accessibilityState={{ disabled }} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
    <View aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, styles.buttonPrint]}>
      <View style={[styles.holdFill, { width: `${progress * 100}%` }]} />
    </View>
    <ButtonPrint />
    <Text style={styles.label}>{label}</Text><Text style={styles.arrow}>{detail}</Text>
  </Pressable>;
}

export function TrackStripe() {
  return (
    <View aria-hidden pointerEvents="none" style={styles.stripe}>
      {Array.from({ length: 40 }, (_, index) => <View key={index} style={styles.mark} />)}
    </View>
  );
}

type MenuItemProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
  busy?: boolean;
  compact?: boolean;
};

export function MenuItem({ label, onPress, disabled, secondary, accessibilityLabel, busy, compact }: MenuItemProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, busy }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, compact && styles.compact, secondary && styles.secondary,
        pressed && styles.pressed, disabled && styles.disabled]}>
      <ButtonPrint />
      <Text style={styles.label}>{label}</Text>
      <Text accessible={false} style={styles.arrow}>{'\u2197'}</Text>
    </Pressable>
  );
}

type FieldChoiceProps = Pick<MenuItemProps, 'label' | 'onPress' | 'disabled' | 'accessibilityLabel'> & {
  selected?: boolean;
};

export function FieldDisclosure({ label, summary, expanded, onPress }: {
  label: string; summary?: string; expanded: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={summary ? label + '. ' + summary : label} aria-expanded={expanded}
      onPress={onPress} style={({ pressed }) => [styles.controlRow, pressed && styles.controlPressed]}>
      <View style={styles.controlLabel}>
        <Text style={fieldStyles.label}>{label}</Text>
        {summary && <Text style={fieldStyles.muted}>{summary}</Text>}
      </View>
      <Text aria-hidden style={fieldStyles.heading}>{expanded ? '−' : '+'}</Text>
    </Pressable>
  );
}

export function FieldToggle({ label, value, onValueChange }: {
  label: string; value: boolean; onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.controlRow}>
      <Pressable accessible={false} aria-hidden tabIndex={-1} onPress={() => onValueChange(!value)}
        style={({ pressed }) => [styles.toggleLabel, pressed && styles.controlPressed]}>
        <Text style={fieldStyles.label}>{label}</Text>
      </Pressable>
      <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} hitSlop={8}
        trackColor={fieldSwitchTrack} thumbColor={value ? party.lime : party.panel} />
    </View>
  );
}

export function FieldChoice({ label, onPress, selected, disabled, accessibilityLabel }: FieldChoiceProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected,
        pressed && styles.choicePressed, disabled && styles.disabled]}>
      <Text style={fieldStyles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controlRow: { minHeight: 48, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12 },
  controlLabel: { flexShrink: 1, gap: 3 },
  toggleLabel: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  controlPressed: { opacity: 0.7 },
  choice: { minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: party.panel, borderWidth: 2, borderColor: party.ink, borderRadius: 8 },
  choiceSelected: { backgroundColor: party.sky },
  choicePressed: { backgroundColor: party.lime },
  paper: { width: '100%', height: '100%' },
  paperBleed: { left: -menuActionLayout.inset, right: -menuActionLayout.inset, bottom: -menuActionLayout.inset },
  buttonPrint: { overflow: 'hidden', borderRadius: 6 },
  holdFill: { height: '100%', backgroundColor: party.sky },
  buttonGrain: { opacity: 0.6 },
  buttonDots: { position: 'absolute', right: 0, bottom: 0, height: '100%', width: 128, maxWidth: '40%', tintColor: party.ink },
  stripe: { height: 12, flexDirection: 'row', overflow: 'hidden', gap: 30, backgroundColor: party.orange },
  mark: { height: 20, width: 3, backgroundColor: party.paper, transform: [{ rotate: '40deg' }] },
  button: { width: '100%', minHeight: 48, paddingHorizontal: 15, paddingVertical: 12,
    borderWidth: 2, borderColor: party.ink, borderRadius: 8, backgroundColor: party.lime,
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 0, color: party.ink }],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  compact: { width: 'auto', maxWidth: '100%', alignSelf: 'flex-start' },
  secondary: { backgroundColor: party.paper },
  pressed: { transform: [{ translateY: 3 }], boxShadow: 'none' },
  disabled: { opacity: 0.65 },
  label: { flexShrink: 1, color: party.ink, fontWeight: '800', fontSize: 16, lineHeight: 20 },
  arrow: { color: party.ink, fontSize: 16, fontWeight: '800', lineHeight: 20 },
});
