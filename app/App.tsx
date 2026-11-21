/** Temporary: switch between the two test screens. Steven's real screens replace this. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BleLab from './BleLab';
import GameLab from './src/GameLab';

export default function App() {
  const [tab, setTab] = useState<'game' | 'ble'>('game');
  return (
    <View style={{ flex: 1, backgroundColor: '#0b0b0f' }}>
      <View style={{ flex: 1 }}>{tab === 'game' ? <GameLab /> : <BleLab />}</View>
      <View style={s.bar}>
        <Tab label="Game Lab" on={tab === 'game'} onPress={() => setTab('game')} />
        <Tab label="BLE Lab" on={tab === 'ble'} onPress={() => setTab('ble')} />
      </View>
    </View>
  );
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.tab, on && s.tabOn]} onPress={onPress}>
      <Text style={{ color: on ? '#fff' : '#888', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', paddingBottom: 30, paddingTop: 10, backgroundColor: '#111', gap: 10, paddingHorizontal: 20 },
  tab: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#1c1c24' },
  tabOn: { backgroundColor: '#e63946' },
});