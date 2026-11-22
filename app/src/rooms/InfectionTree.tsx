import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { fieldStyles, party } from '../ui/fieldDay';
import { formatClock } from '../ui/formatDuration';
import type { InfectionNode } from './buildInfectionTree';
import { PlayerIcon } from '../ui/PlayerIcon';

type Icons = Record<string, string | undefined> | undefined;

const rootGap = 12;
const inset = 10;

function branchWidth(node: InfectionNode, columnWidth: number): number {
  return node.children.length
    ? node.children.reduce((width, child) => width + branchWidth(child, columnWidth), 0)
    : columnWidth;
}

function Branch({ node, columnWidth, viewer, icons }: { node: InfectionNode; columnWidth: number; viewer?: string; icons: Icons }) {
  const name = node.name === viewer ? `${node.name} (you)` : node.name;
  const source = node.origin === 'starter';
  const time = node.time === undefined ? undefined : formatClock(Math.floor(node.time / 1000));
  const curedAt = node.cure && formatClock(Math.floor(node.cure.time / 1000));
  const curedBy = node.cure?.actor;
  const cureLabel = curedBy ? `Cured by ${curedBy}` : curedAt && `Cured at ${curedAt}`;
  const origin = source ? 'Starting infected' : time ? `Infected at ${time}` : 'Earlier infection unrecorded';
  const description = node.parent ? `${node.parent} infected ${name} at ${time}` : `${name}, ${origin}`;
  const accessibleDescription = [description, node.isDoctor && 'Doctor',
    curedBy ? `${cureLabel} at ${curedAt}` : cureLabel].filter(Boolean).join('. ');

  return <View style={s.branch}>
    <View style={[s.node, { width: columnWidth }]} accessible
      accessibilityLabel={accessibleDescription}>
      {icons?.[node.name]
        ? <View aria-hidden><PlayerIcon icon={icons[node.name]} size={34} ring={source ? party.orange : party.ink} ringWidth={3} /></View>
        : <View style={[s.marker, source && s.sourceMarker]} aria-hidden>
          <Text style={s.initial} allowFontScaling={false}>{Array.from(node.name)[0]?.toUpperCase()}</Text>
        </View>}
      <Text style={s.name}>{name}</Text>
      {node.isDoctor && <Text style={s.doctorBadge}>Doctor</Text>}
      {cureLabel && <Text style={s.cured}>{cureLabel}</Text>}
    </View>
    {node.children.length > 0 && <>
      <View style={[s.stem, s.parentStem]} />
      <View style={s.children}>
        {node.children.map((child, index) => <View key={index} style={s.branch}>
          <View style={s.fork}>
            {node.children.length > 1 && <View style={[s.rail,
              index === 0 && s.railStart, index === node.children.length - 1 && s.railEnd]} />}
            <View style={[s.stem, s.childStem]} />
          </View>
          <Branch node={child} columnWidth={columnWidth} viewer={viewer} icons={icons} />
        </View>)}
      </View>
    </>}
  </View>;
}

export function InfectionTree({ roots, viewer, icons }: { roots: InfectionNode[]; viewer?: string; icons?: Icons }) {
  const { fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const columnWidth = 108 * Math.max(1, fontScale);
  const width = roots.reduce((total, node) => total + branchWidth(node, columnWidth), 2 * inset)
    + rootGap * (roots.length - 1);
  const firstRootCenter = roots[0] ? inset + branchWidth(roots[0], columnWidth) / 2 : 0;
  const overflow = viewportWidth > 0 && width > viewportWidth;

  useEffect(() => {
    if (!overflow) return;
    const x = Math.max(0, Math.min(width - viewportWidth, firstRootCenter - viewportWidth / 2));
    scroll.current?.scrollTo({ x, animated: false });
  }, [firstRootCenter, overflow, viewportWidth, width]);

  if (!roots.length) return null;

  const spread = roots.some(root => root.children.length > 0 || root.origin === 'bite');
  return <View style={s.panel}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={fieldStyles.heading}>Infection tree</Text>
      {!spread && <Text style={fieldStyles.muted}>No infections spread this round.</Text>}
      {overflow && <Text style={fieldStyles.muted}>Scroll sideways to see all branches.</Text>}
    </View>
    <ScrollView ref={scroll} horizontal nestedScrollEnabled focusable={overflow}
      accessibilityLabel="Infection branches" scrollEnabled={overflow}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)} contentContainerStyle={s.roots}>
      {roots.map((root, index) => <Branch key={index} node={root} columnWidth={columnWidth} viewer={viewer} icons={icons} />)}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: party.panel, borderColor: party.ink, borderWidth: 2, borderRadius: 10, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingTop: 14, gap: 4 },
  doctorBadge: { color: party.ready, borderColor: party.ready, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  roots: { flexGrow: 1, justifyContent: 'center', gap: rootGap, paddingHorizontal: inset, paddingVertical: 16 },
  branch: { alignItems: 'center', flexShrink: 0 },
  children: { flexDirection: 'row' },
  node: { alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  marker: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: party.ink,
    backgroundColor: party.paper, justifyContent: 'center', alignItems: 'center', marginBottom: 3 },
  sourceMarker: { backgroundColor: party.orange },
  initial: { color: party.ink, fontSize: 18, fontWeight: '900' },
  name: { ...fieldStyles.label, textAlign: 'center' },
  cured: { color: party.ready, fontSize: 12, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  stem: { width: 2, backgroundColor: party.ink },
  parentStem: { height: 12, marginTop: 4 },
  fork: { alignSelf: 'stretch', alignItems: 'center', height: 12 },
  childStem: { height: '100%' },
  rail: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: party.ink },
  railStart: { left: '50%' },
  railEnd: { right: '50%' },
});
