import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DEFAULT_THRESHOLDS, ProximityTracker, Reading, Zone } from './src/bluetooth/proximity';
import { startBluetooth, stopBluetooth } from './src/bluetooth/scanner';

const COLORS: Record<Zone, string> = { HOT: '#ff3b3b', WARM: '#f59e0b', COLD: '#3b82f6' };
const myNumber = 1 + Math.floor(Math.random() * 999); // different on each phone

export default function App() {
  const tracker = useRef(new ProximityTracker());
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Tap Start on both phones');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [th, setTh] = useState(DEFAULT_THRESHOLDS);
  const calibSamples = useRef<number[] | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  // Start/stop Bluetooth, and refresh the list ~3x per second
  useEffect(() => {
    if (!running) return;
    startBluetooth(
      myNumber,
      (n, rssi) => {
        tracker.current.add(n, rssi);
        calibSamples.current?.push(rssi);
      },
      setStatus,
    );
    const timer = setInterval(() => setReadings(tracker.current.snapshot()), 300);
    return () => {
      clearInterval(timer);
      stopBluetooth();
      setReadings([]);
    };
  }, [running]);

  const closest = readings[0]?.zone ?? null;

  // Vibrate: HOT = strong buzz every 0.7 s, WARM = light tick every 1.8 s
  useEffect(() => {
    if (!running || !closest || closest === 'COLD') return;
    const hot = closest === 'HOT';
    const t = setInterval(
      () => Haptics.impactAsync(hot ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light),
      hot ? 700 : 1800,
    );
    return () => clearInterval(t);
  }, [running, closest]);

  function nudge(key: 'hot' | 'warm', delta: number) {
    tracker.current.thresholds = { ...tracker.current.thresholds, [key]: tracker.current.thresholds[key] + delta };
    setTh(tracker.current.thresholds);
  }

  // Hold both phones at "bite distance" for 5 s; HOT line goes just below the median signal
  function calibrate() {
    calibSamples.current = [];
    setCalibrating(true);
    setTimeout(() => {
      const s = [...(calibSamples.current ?? [])].sort((a, b) => a - b);
      calibSamples.current = null;
      setCalibrating(false);
      if (s.length < 5) return setStatus('Calibration failed: the other phone wasn’t heard');
      const hot = Math.round(s[Math.floor(s.length / 2)] - 4);
      tracker.current.thresholds = { hot, warm: hot - 14 };
      setTh(tracker.current.thresholds);
      setStatus(`Calibrated: HOT ≥ ${hot}, WARM ≥ ${hot - 14}`);
    }, 5000);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>PULSE · BLE Lab</Text>
      <Text style={styles.dim}>I am player #{myNumber}</Text>
      <Text style={styles.dim}>{status}</Text>

      <View style={[styles.bigCircle, { backgroundColor: closest ? COLORS[closest] : '#1f2430' }]}>
        <Text style={styles.bigText}>{closest ?? (running ? 'Nobody' : '—')}</Text>
      </View>

      <Btn label={running ? 'Stop' : 'Start'} onPress={() => setRunning(!running)} />

      <Text style={styles.section}>Players heard</Text>
      {readings.length === 0 && <Text style={styles.dim}>None yet</Text>}
      {readings.map((r) => (
        <View key={r.playerNumber} style={styles.row}>
          <Text style={styles.rowText}>Player #{r.playerNumber}</Text>
          <Text style={[styles.rowText, { color: COLORS[r.zone], fontWeight: 'bold' }]}>{r.zone}</Text>
          <Text style={styles.rowText}>{r.rssi} dBm</Text>
        </View>
      ))}

      <Text style={styles.section}>Tuning</Text>
      <View style={styles.row}>
        <Text style={styles.rowText}>HOT if ≥ {th.hot}</Text>
        <Btn small label="−" onPress={() => nudge('hot', -2)} />
        <Btn small label="+" onPress={() => nudge('hot', 2)} />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>WARM if ≥ {th.warm}</Text>
        <Btn small label="−" onPress={() => nudge('warm', -2)} />
        <Btn small label="+" onPress={() => nudge('warm', 2)} />
      </View>
      <Text style={styles.dim}>Calibrate: hold both phones at arm’s length, then tap.</Text>
      <Btn label={calibrating ? 'Calibrating… hold still' : 'Calibrate HOT distance'} onPress={calibrate} />
    </ScrollView>
  );
}

function Btn({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, small && styles.btnSmall, pressed && { opacity: 0.6 }]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0d12' },
  content: { padding: 24, paddingTop: 70, gap: 12, alignItems: 'stretch' },
  title: { color: 'white', fontSize: 26, fontWeight: 'bold', textAlign: 'center' },
  dim: { color: '#8a90a0', textAlign: 'center' },
  section: { color: 'white', fontSize: 18, fontWeight: '600', marginTop: 12 },
  bigCircle: { width: 200, height: 200, borderRadius: 100, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  bigText: { color: 'white', fontSize: 36, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#161a22', padding: 12, borderRadius: 10, gap: 8 },
  rowText: { color: 'white', fontSize: 16 },
  btn: { backgroundColor: '#2f6bff', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 16 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
