import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { useFonts, GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { IMFellEnglishSC_400Regular } from '@expo-google-fonts/im-fell-english-sc';

export const background = require('../../assets/pulse/bg.jpg');
export const ink = '#ececec';
export const surface = '#000';
export const scriptFace = { fontFamily: 'GreatVibes_400Regular' };
export const menuFace = { fontFamily: 'IMFellEnglishSC_400Regular' };

export function useMenuFonts() {
  return useFonts({ GreatVibes_400Regular, IMFellEnglishSC_400Regular })[0];
}

export function MenuDivider({ flipped = false }) {
  return <Image accessible={false} source={require('../../assets/pulse/divider.png')} style={[s.divider, flipped && { transform: [{ scaleY: -1 }] }]} />;
}

/** Menu entry; curly flourishes appear on both sides while pressed. */
export function MenuItem({ label, fonts, onPress, disabled = false }: { label: string; fonts: boolean; disabled?: boolean; onPress: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled, busy: disabled }} onPressIn={() => setOn(true)} onPressOut={() => setOn(false)} onPress={onPress} style={s.item}>
      <Image source={require('../../assets/pulse/curl.png')} style={[s.curl, !on && s.hidden]} />
      <Text style={[s.itemText, fonts && menuFace, on && s.itemOn]}>{label}</Text>
      <Image source={require('../../assets/pulse/curl.png')} style={[s.curl, { transform: [{ scaleX: -1 }] }, !on && s.hidden]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  divider: { width: 160, height: 28, marginVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemText: {
    fontFamily: 'Baskerville',
    fontSize: 32,
    letterSpacing: 1,
    color: ink,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
  },
  itemOn: { color: '#ffffff', textShadowColor: 'rgba(255,255,255,0.85)', textShadowRadius: 10 },
  curl: { width: 54, height: 17 },
  hidden: { opacity: 0 },

});
