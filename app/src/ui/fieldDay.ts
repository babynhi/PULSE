import { StyleSheet } from 'react-native';

export const party = {
  paper: '#FFF3D8',
  panel: '#FFFAED',
  ink: '#172A36',
  muted: '#4C5960',
  line: '#8B8677',
  sky: '#84DDF1',
  lime: '#C4F84A',
  orange: '#FF7548',
  alert: '#8E301C',
};

export const menuActionLayout = { inset: 16, gap: 8 };
export const fieldSwitchTrack = { false: party.line, true: party.ink };

export const fieldStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: party.paper },
  content: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, gap: 16 },
  title: { color: party.ink, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  heading: { color: party.ink, fontSize: 22, fontWeight: '800' },
  body: { color: party.ink, fontSize: 17, lineHeight: 24 },
  muted: { color: party.muted, fontSize: 15, lineHeight: 21 },
  label: { color: party.ink, fontSize: 16, fontWeight: '800' },
  metric: { color: party.ink, fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kicker: { color: party.muted, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  panel: { backgroundColor: party.panel, borderColor: party.ink, borderWidth: 1, borderRadius: 8, padding: 16, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2,
    borderColor: party.ink, borderRadius: 8, color: party.ink, backgroundColor: party.panel, fontSize: 18 },
  error: { color: party.alert, fontSize: 16, fontWeight: '600' },
});
