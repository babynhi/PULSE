import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GameResult, Role, Team } from '../../../shared/protocol';
import { FieldDisclosure, fieldStyles, MenuItem, MenuPaper, party, TrackStripe } from '../ui/Menu';

type RecapProps = {
  winner: Team;
  reason: string;
  role?: Role;
  durationSec: number;
  totals: [number, string][];
  standings: { name: string; status: string }[];
  onReplay: () => void;
};

export function LiveRecap({ result, name, onReplay }: { result: GameResult; name?: string; onReplay: () => void }) {
  return <RoundRecap winner={result.winner} reason={result.reason}
    role={result.standings.find(player => player.name === name)?.finalRole} durationSec={result.durationSec}
    totals={[[result.infectedTotal, 'Bites'], [result.curedTotal, 'Cures'], [result.eliminatedTotal, 'Eliminated']]}
    standings={result.standings.map(player => ({
      name: player.name + (player.name === name ? ' (you)' : ''),
      status: [player.startRole !== player.finalRole ? player.startRole + ' → ' + player.finalRole : player.finalRole,
        player.status === 'eliminated' && 'Eliminated'].filter(Boolean).join(' · '),
    }))} onReplay={onReplay} />;
}

export function RoundRecap({ winner, reason, role, durationSec, totals, standings, onReplay }: RecapProps) {
  const [showStandings, setShowStandings] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const twoColumns = totals.length === 3 && width / fontScale < 420;
  const duration = Math.floor(durationSec / 60) + ':' + String(durationSec % 60).padStart(2, '0');
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={fieldStyles.page}>
    <ScrollView contentContainerStyle={fieldStyles.content}>
      <View style={s.ticket}>
        <View style={[s.banner, { backgroundColor: winner === 'infected' ? party.orange : party.lime }]}>
          <MenuPaper />
          <Text accessibilityRole="header" style={s.winner}>{winner === 'infected' ? 'Infected win!' : 'Survivors win!'}</Text>
          <Text style={fieldStyles.body}>{reason}</Text>
        </View>
        <TrackStripe />
        <View style={s.results}>
          {role && <Text style={fieldStyles.label}>Your final role · <Text style={s.role}>{role}</Text></Text>}
          <View style={s.stats}>{[[duration, 'Duration'], ...totals].map(([value, label]) =>
            <View key={label} style={[s.stat, twoColumns && s.halfStat]}>
              <Text style={fieldStyles.heading}>{value}</Text><Text style={fieldStyles.muted}>{label}</Text>
            </View>)}</View>
        </View>
      </View>
      <View style={s.actions}>
        <MenuItem compact label="Play again" onPress={onReplay} />
        <FieldDisclosure label={`Standings (${standings.length})`} expanded={showStandings} onPress={() => setShowStandings(!showStandings)} />
      </View>
      {showStandings && <View style={s.standings}>{standings.map((player, i) =>
        <View key={i} style={s.standing}>
          <Text style={s.player}>{player.name}</Text><Text style={[fieldStyles.muted, s.role]}>{player.status}</Text>
        </View>)}</View>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  ticket: { borderRadius: 10, borderWidth: 2, borderColor: party.ink, backgroundColor: party.panel, overflow: 'hidden' },
  banner: { padding: 18, gap: 6 },
  winner: { ...fieldStyles.title, fontStyle: 'italic' },
  results: { padding: 16, gap: 14 },
  stats: { ...fieldStyles.row, alignItems: 'flex-start', columnGap: 16, rowGap: 8 },
  stat: { minWidth: 48 },
  halfStat: { flexBasis: '44%' },
  role: { textTransform: 'capitalize' },
  actions: { ...fieldStyles.row, columnGap: 20 },
  standings: { gap: 4 },
  standing: { ...fieldStyles.row, justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8, borderColor: party.line },
  player: { ...fieldStyles.label, flexShrink: 1 },
});
