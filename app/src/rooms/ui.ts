import { StyleSheet } from 'react-native';

export const C = {
  bg: '#07090f',
  card: '#111522',
  line: '#232a3d',
  text: '#f2f4f8',
  muted: '#8b93a7',
  red: '#e63946',
  redDeep: '#6a040f',
  green: '#5dd39e',
  amber: '#f4a261',
};

/** Shared look for the room and round screens: dark navy, red accent, system font. */
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 22, paddingVertical: 28, gap: 12, flexGrow: 1 },
  title: { color: C.text, fontWeight: '800', fontSize: 32, marginBottom: 8 },
  heading: { color: C.text, fontWeight: '700', fontSize: 18, marginTop: 14 },
  label: { color: C.text, fontSize: 16, fontWeight: '600' },
  muted: { color: C.muted, fontSize: 15 },
  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, color: C.text, fontSize: 18 },
  primary: { minHeight: 54, justifyContent: 'center', alignItems: 'center', backgroundColor: C.red, borderRadius: 14, marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: C.line },
  secondaryText: { color: C.text, fontSize: 16, fontWeight: '600' },
  dimmed: { opacity: 0.55 },
  error: { color: '#ff8a8a', fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 6 },
});
