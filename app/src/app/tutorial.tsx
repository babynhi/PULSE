import { router } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const cards = [
  ['Know your role', 'Infected players try to infect everyone. Innocents survive until time runs out. The Doctor can cure infected players. Keep your role secret.'],
  ['Bite and Heal', 'Get close and hold Bite or Heal for two seconds by default. Stay close until the action finishes. The Doctor starts with two healing charges.'],
  ['Stay inside the zone', 'When the safe zone is enabled, watch for shrink warnings. If you go outside, return before your countdown ends to avoid elimination.'],
] as const;

export default function Tutorial() {
  const [page, setPage] = useState(0);
  const slider = useRef<ComponentRef<typeof ScrollView>>(null);
  const { width } = useWindowDimensions();
  const finish = () => router.dismissTo('/');
  function advance() {
    if (page === cards.length - 1) return finish();
    slider.current?.scrollTo({ x: (page + 1) * width, animated: false });
    setPage(page + 1);
  }
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView ref={slider} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={({ nativeEvent }) => setPage(Math.round(nativeEvent.contentOffset.x / width))}>
        {cards.map(([title, detail], index) => (
          <ScrollView key={title} style={{ width }} contentContainerStyle={styles.card}
            accessibilityElementsHidden={page !== index}
            importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}>
            <Text style={styles.step}>How to Play · {index + 1} of {cards.length}</Text>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.detail}>{detail}</Text>
          </ScrollView>
        ))}
      </ScrollView>
      <View style={styles.controls}>
        <Button title="Skip tutorial" onPress={finish} />
        <Button title={page === cards.length - 1 ? 'Finish' : 'Next card'} onPress={advance} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { flexGrow: 1, padding: 28, justifyContent: 'center', gap: 18 },
  step: { color: '#BCFA74', fontWeight: '700', fontSize: 16 },
  title: { color: '#F2F5ED', fontWeight: '800', fontSize: 40 },
  detail: { color: '#CBD4D0', fontSize: 21, lineHeight: 31 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 20 },
});
