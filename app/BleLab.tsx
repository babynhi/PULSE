import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DEFAULT_THRESHOLDS, ProximityTracker, Reading, Zone } from './src/bluetooth/proximity';
import { FieldChoice, fieldStyles, MenuItem, party } from './src/ui/Menu';
import { startBluetooth, stopBluetooth } from './src/bluetooth/scanner';

const signalFill: Record<Zone, string> = { HOT: party.orange, WARM: party.lime, COLD: party.sky };
const myNumber = 1 + Math.floor(Math.random() * 999); // different on each phone

export default function App() {
  const tracker = useRef(new ProximityTracker());
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Tap Start on both phones');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [th, setTh] = useState(DEFAULT_THRESHOLDS);
  const calibSamples = useRef<number[] | null>(null);
  const calibrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState('');

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
      if (calibrationTimer.current !== null) clearTimeout(calibrationTimer.current);
      calibrationTimer.current = null;
      calibSamples.current = null;
      setCalibrating(false);
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
    if (!running || calibrationTimer.current !== null) return;
    calibSamples.current = [];
    setCalibrating(true);
    setCalibrationResult('');
    calibrationTimer.current = setTimeout(() => {
      calibrationTimer.current = null;
      const s = [...(calibSamples.current ?? [])].sort((a, b) => a - b);
      calibSamples.current = null;
      setCalibrating(false);
      if (s.length < 5) return setCalibrationResult('Too few readings. Keep both phones scanning at arm’s length and try again.');
      const hot = Math.round(s[Math.floor(s.length / 2)] - 4);
      tracker.current.thresholds = { hot, warm: hot - 14 };
      setTh(tracker.current.thresholds);
      setCalibrationResult(`Calibrated: HOT ≥ ${hot} dBm, WARM ≥ ${hot - 14} dBm`);
    }, 5000);
  }

  return (
    <ScrollView style={fieldStyles.page} contentContainerStyle={fieldStyles.content}>
      <Text style={fieldStyles.title}>PULSE · BLE Lab</Text>
      <Text style={fieldStyles.muted}>I am player #{myNumber}</Text>
      <Text style={fieldStyles.muted}>{running ? status : 'Tap Start on both phones'}</Text>

      <View style={[styles.bigCircle, { backgroundColor: closest ? signalFill[closest] : party.panel }]}>
        <Text style={fieldStyles.heading}>{closest ?? (running ? 'Nobody' : '—')}</Text>
      </View>

      <MenuItem label={running ? 'Stop' : 'Start'} onPress={() => setRunning(!running)} />

      <Text style={fieldStyles.heading}>Players heard</Text>
      {readings.length === 0 && <Text style={fieldStyles.muted}>None yet</Text>}
      {readings.map((r) => (
        <View key={r.playerNumber} style={[fieldStyles.panel, styles.row]}>
          <Text style={fieldStyles.body}>Player #{r.playerNumber}</Text>
          <Text style={[fieldStyles.label, styles.zone, { backgroundColor: signalFill[r.zone] }]}>{r.zone}</Text>
          <Text style={fieldStyles.body}>{r.rssi} dBm</Text>
        </View>
      ))}

      <Text style={fieldStyles.heading}>Tuning</Text>
      <View style={[fieldStyles.panel, styles.row]}>
        <Text style={fieldStyles.body}>HOT if ≥ {th.hot}</Text>
        <FieldChoice label="−" accessibilityLabel="Decrease hot threshold" onPress={() => nudge('hot', -2)} />
        <FieldChoice label="+" accessibilityLabel="Increase hot threshold" onPress={() => nudge('hot', 2)} />
      </View>
      <View style={[fieldStyles.panel, styles.row]}>
        <Text style={fieldStyles.body}>WARM if ≥ {th.warm}</Text>
        <FieldChoice label="−" accessibilityLabel="Decrease warm threshold" onPress={() => nudge('warm', -2)} />
        <FieldChoice label="+" accessibilityLabel="Increase warm threshold" onPress={() => nudge('warm', 2)} />
      </View>
      <Text style={fieldStyles.muted}>{running ? 'Hold the phones at arm’s length for five seconds.' : 'Start scanning on both phones to calibrate.'}</Text>
      <MenuItem label={calibrating ? 'Calibrating… hold still' : 'Calibrate HOT distance'}
        disabled={!running || calibrating} busy={calibrating} onPress={calibrate} />
      {!!calibrationResult && <Text accessibilityLiveRegion="polite" style={fieldStyles.body}>{calibrationResult}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bigCircle: { width: 200, height: 200, borderRadius: 100, alignSelf: 'center', alignItems: 'center',
    justifyContent: 'center', marginVertical: 12, borderWidth: 2, borderColor: party.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  zone: { paddingHorizontal: 8, paddingVertical: 4 },
});
