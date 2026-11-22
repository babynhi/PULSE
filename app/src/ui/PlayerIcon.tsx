/**
 * A player's profile icon: one of the 40 black-and-white creature heads (scripts/make-icons.mjs),
 * shown in a round badge with an optional coloured ring (red = infected, grey = survivor ping).
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PLAYER_ICONS } from '../../../shared/protocol';
import { PLAYER_ICON_IMAGES } from './playerIconImages';
import { party } from './fieldDay';

export function iconSource(icon: string | undefined) {
  return PLAYER_ICON_IMAGES[icon ?? ''] ?? PLAYER_ICON_IMAGES[PLAYER_ICONS[0]];
}

/** Human name for screen readers: "bunny", "black bunny". */
export function iconLabel(icon: string | undefined) {
  if (!icon) return 'icon';
  return icon.endsWith('-light') ? `black ${icon.slice(0, -6)}` : `white ${icon}`;
}

export function PlayerIcon({ icon, size = 32, ring, ringWidth = 2 }: { icon: string | undefined; size?: number; ring?: string; ringWidth?: number }) {
  const outer = size + (ring ? ringWidth * 2 : 0);
  return <View style={{ width: outer, height: outer, borderRadius: outer / 2, borderWidth: ring ? ringWidth : 0,
    borderColor: ring, overflow: 'hidden', backgroundColor: party.ink }}>
    <Image source={iconSource(icon)} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
  </View>;
}

/** Grid of every icon. Taken ones are greyed out and can't be picked. */
export function IconPicker({ value, taken = [], onChange, disabled }: {
  value: string | undefined; taken?: readonly string[]; onChange: (icon: string) => void; disabled?: boolean;
}) {
  return <View style={s.grid} accessibilityRole="radiogroup" accessibilityLabel="Profile icon">
    {PLAYER_ICONS.map(icon => {
      const isTaken = taken.includes(icon) && icon !== value;
      const selected = icon === value;
      return <Pressable key={icon} disabled={disabled || isTaken} onPress={() => onChange(icon)}
        accessibilityRole="radio" accessibilityLabel={iconLabel(icon) + (isTaken ? ', taken' : '')}
        accessibilityState={{ checked: selected, disabled: disabled || isTaken }}
        style={({ pressed }) => [s.cell, selected && s.selected, pressed && s.pressed, isTaken && s.taken]}>
        <PlayerIcon icon={icon} size={40} />
        {isTaken && <View style={s.takenMark} pointerEvents="none"><Text style={s.takenText}>Taken</Text></View>}
      </Pressable>;
    })}
  </View>;
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { padding: 3, borderRadius: 26, borderWidth: 3, borderColor: 'transparent' },
  selected: { borderColor: party.orange, backgroundColor: party.lime },
  pressed: { opacity: 0.7 },
  taken: { opacity: 0.25 },
  takenMark: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  takenText: { color: party.ink, fontSize: 9, fontWeight: '900', backgroundColor: party.paper, paddingHorizontal: 2 },
});
