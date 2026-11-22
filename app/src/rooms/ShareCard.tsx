/**
 * The screenshot-worthy end-of-round card: winner, MVPs and the infection chain.
 * "Share" turns it into a PNG and opens the share sheet (Instagram story, Messages, etc.).
 */
import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import type { GameEvent, Mvp, Team } from '../../../shared/protocol';
import { formatClock } from '../ui/formatDuration';
import { MenuItem, party } from '../ui/Menu';

const AWARD_ICON: Record<string, string> = {
  'Most infections': '🧟', 'Longest survivor': '🏃', 'Best doctor': '💉', 'Patient zero': '☣️',
};

type CardProps = { winner: Team; reason: string; durationSec: number; mvps: Mvp[]; events: readonly GameEvent[]; viewer?: string };

export function RecapCard({ winner, reason, durationSec, mvps, events, viewer }: CardProps) {
  const chain = events.filter((e) => e.kind === 'bite' || e.kind === 'heal').slice(0, 6);
  const more = events.filter((e) => e.kind === 'bite' || e.kind === 'heal').length - chain.length;
  const infectedWon = winner === 'infected';
  return <View style={[c.card, infectedWon ? c.cardInfected : c.cardSurvivors]} collapsable={false}>
    <View style={c.top}>
      <Text style={c.brand}>PULSE</Text>
      <Text style={c.time}>{formatClock(durationSec)} round</Text>
    </View>
    <Text style={c.winner}>{infectedWon ? 'Infected win!' : 'Survivors win!'}</Text>
    <Text style={c.reason}>{reason}</Text>

    {mvps.length > 0 && <View style={c.awards}>{mvps.map((m) =>
      <View key={m.title} style={c.award}>
        <Text style={c.awardIcon}>{AWARD_ICON[m.title] ?? '⭐'}</Text>
        <View style={c.awardText}>
          <Text style={c.awardTitle}>{m.title}</Text>
          <Text style={c.awardName} numberOfLines={1}>{m.name}{m.name === viewer ? ' (me)' : ''}</Text>
        </View>
        <Text style={c.awardDetail}>{m.detail}</Text>
      </View>)}</View>}

    {chain.length > 0 && <View style={c.chain}>
      <Text style={c.chainTitle}>How it spread</Text>
      {chain.map((e, i) => <Text key={i} style={c.chainLine} numberOfLines={1}>
        <Text style={c.chainTime}>{formatClock(Math.floor(e.t / 1000))}  </Text>
        {e.actor} {e.kind === 'bite' ? '🦷' : '💉'} {e.target}
      </Text>)}
      {more > 0 && <Text style={c.chainTime}>+{more} more</Text>}
    </View>}

    <Text style={c.footer}>zombie tag with friends · play PULSE</Text>
  </View>;
}

export function ShareRecap(props: CardProps) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function share() {
    setBusy(true);
    setError('');
    try {
      if (Platform.OS === 'web') throw new Error('web');
      const { captureRef } = await import('react-native-view-shot');
      const Sharing = await import('expo-sharing');
      // view-shot's types predate RN's host-element refs
      const uri = await captureRef(card as any, { format: 'png', quality: 1, result: 'tmpfile', width: 1080 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your PULSE round' });
    } catch {
      // Older build without the native modules: share the result as text instead.
      try {
        const top = props.mvps.map((m) => `${m.title}: ${m.name} (${m.detail})`).join('\n');
        await Share.share({ message: `PULSE: ${props.winner === 'infected' ? 'Infected win!' : 'Survivors win!'} ${props.reason}\n${top}` });
      } catch { setError('Could not open the share sheet. Take a screenshot instead!'); }
    } finally {
      setBusy(false);
    }
  }

  return <View style={c.wrap}>
    <View ref={card} collapsable={false}><RecapCard {...props} /></View>
    {error !== '' && <Text style={c.error}>{error}</Text>}
    <MenuItem compact label={busy ? 'Preparing card…' : 'Share recap card'} disabled={busy} onPress={share} />
  </View>;
}

const c = StyleSheet.create({
  wrap: { gap: 10 },
  card: { borderRadius: 18, padding: 22, gap: 10, borderWidth: 3, borderColor: party.ink, overflow: 'hidden' },
  cardInfected: { backgroundColor: '#1d0f12' },
  cardSurvivors: { backgroundColor: '#0f1d1a' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: party.lime, fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  time: { color: '#cfd6d9', fontSize: 14, fontWeight: '700' },
  winner: { color: '#fff', fontSize: 38, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1.2, marginTop: 6 },
  reason: { color: '#cfd6d9', fontSize: 16, fontWeight: '600' },
  awards: { gap: 8, marginTop: 8 },
  award: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 10 },
  awardIcon: { fontSize: 24 },
  awardText: { flex: 1 },
  awardTitle: { color: '#9aa6ab', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  awardName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  awardDetail: { color: party.lime, fontSize: 14, fontWeight: '800' },
  chain: { gap: 3, marginTop: 8 },
  chainTitle: { color: '#9aa6ab', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  chainLine: { color: '#fff', fontSize: 15, fontWeight: '700' },
  chainTime: { color: '#9aa6ab', fontSize: 13, fontWeight: '700' },
  footer: { color: '#7f8b90', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  error: { color: party.alert, fontWeight: '700' },
});
