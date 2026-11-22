import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RoomView } from '../../../shared/protocol';
import { fieldStyles, MenuPaper, party, TrackStripe } from '../ui/Menu';

export function Dispersal({ room, bluetoothStatus }: { room: RoomView; bluetoothStatus: string }) {
  const [now, setNow] = useState(room.serverNow);
  const [offset] = useState(() => room.serverNow - Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(timer);
  }, [offset]);
  const seconds = Math.max(0, Math.ceil(((room.countdownEndsAt ?? now) - now) / 1000));
  return <ScrollView style={fieldStyles.page} contentContainerStyle={s.content}>
    <View style={s.banner}>
      <MenuPaper />
      <Text accessibilityRole="header" style={fieldStyles.title}>Spread out!</Text>
      <Text style={fieldStyles.body}>Move away from the group. Your private role unlocks when the countdown ends.</Text>
      <Text accessibilityRole="timer" accessibilityLabel={seconds + ' seconds to disperse'} style={s.timer}>{seconds}<Text style={fieldStyles.heading}> sec</Text></Text>
    </View>
    <TrackStripe />
    {!!bluetoothStatus && <Text style={s.status}>{bluetoothStatus}</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { flexGrow: 1 },
  banner: { backgroundColor: party.sky, padding: 24, gap: 12 },
  timer: { ...fieldStyles.metric, fontSize: 72 },
  status: { ...fieldStyles.muted, margin: 20 },
});
