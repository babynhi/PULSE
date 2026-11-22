/** Temporary: switch between the two test screens. Steven's real screens replace this. */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BleLab from './BleLab';
import GameLab from './src/GameLab';
import { FieldChoice, fieldStyles, MenuPaper, party } from './src/ui/Menu';

export default function App() {
  const [tab, setTab] = useState<'game' | 'ble'>('game');
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={fieldStyles.page}>
      <View style={fieldStyles.page}>{tab === 'game' ? <GameLab /> : <BleLab />}</View>
      <View style={s.bar}>
        <MenuPaper />
        <FieldChoice label="Game Lab" selected={tab === 'game'} onPress={() => setTab('game')} />
        <FieldChoice label="BLE Lab" selected={tab === 'ble'} onPress={() => setTab('ble')} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: party.line },
});
