import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Home() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text accessibilityRole="header" style={styles.title}>PULSE</Text>
          <Text style={styles.description}>A hidden-role survival game played together, in person.</Text>
        </View>
        <View style={styles.actions}>
          {([
            ['/demo', 'Play demo round'], ['/host', 'Host Game'], ['/join', 'Join Game'], ['/tutorial', 'How to Play'],
          ] as const).map(([href, label], index) => (
            <Link key={href} href={href} asChild>
              <Pressable style={({ pressed }) => [styles.action, index === 0 && styles.primary, pressed && styles.pressed]}>
                <Text style={[styles.label, index === 0 && styles.primaryLabel]}>{label}</Text>
              </Pressable>
            </Link>
          ))}
          <Link href="/ble-lab" style={styles.lab}>Bluetooth Lab</Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101518' },
  content: { flexGrow: 1, justifyContent: 'space-between', padding: 28, gap: 48 },
  title: { color: '#BCFA74', fontSize: 64, fontWeight: '900', letterSpacing: -3 },
  description: { color: '#A7B4AF', fontSize: 20, marginTop: 12, maxWidth: 350 },
  actions: { gap: 12 },
  action: { borderColor: '#63716B', borderWidth: 1, borderRadius: 12, padding: 18 },
  primary: { backgroundColor: '#BCFA74', borderColor: '#BCFA74' },
  pressed: { opacity: 0.75 },
  label: { color: '#F2F5ED', fontSize: 20, fontWeight: '700' },
  primaryLabel: { color: '#152013' },
  lab: { color: '#A7B4AF', paddingVertical: 14, textDecorationLine: 'underline' },
});
