/**
 * Anonymous kill feed: "Someone was infected… 3 survivors left". Shows each new line as a
 * banner for a few seconds. No names, ever (the server never sends them). It's the paranoia.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { FeedItem } from '../../../shared/protocol';
import { party } from '../ui/fieldDay';

const SHOW_MS = 4500;
const ICON: Record<FeedItem['kind'], string> = { infected: '🧟', cured: '💉', eliminated: '☠️' };

export function KillFeed({ feed }: { feed: FeedItem[] | undefined }) {
  // Lines that already existed when this screen opened are not replayed.
  const seen = useRef<number>(Math.max(0, ...(feed ?? []).map(f => f.id)));
  const [current, setCurrent] = useState<FeedItem | null>(null);
  const [fade] = useState(() => new Animated.Value(0));
  const queue = useRef<FeedItem[]>([]);
  const busy = useRef(false);

  function showNext() {
    const next = queue.current.shift();
    if (!next) { busy.current = false; return; }
    busy.current = true;
    setCurrent(next);
    Haptics.notificationAsync(next.kind === 'infected' ? Haptics.NotificationFeedbackType.Warning
      : Haptics.NotificationFeedbackType.Success).catch(() => { });
    fade.setValue(0);
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(SHOW_MS),
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => showNext());
  }

  useEffect(() => {
    const fresh = (feed ?? []).filter(f => f.id > seen.current);
    if (!fresh.length) return;
    seen.current = Math.max(...fresh.map(f => f.id));
    queue.current.push(...fresh);
    if (!busy.current) showNext();
    // showNext only reads refs and stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);

  if (!current) return null;
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="assertive" style={[s.banner,
    current.kind === 'infected' ? s.infected : current.kind === 'cured' ? s.cured : s.eliminated,
    { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
    <Text style={s.icon}>{ICON[current.kind]}</Text>
    <View style={s.body}>
      <Text style={s.text}>{current.text.split('…')[0].replace(/\.$/, '')}</Text>
      {current.infectedLeft != null && current.survivorsLeft != null && <Text style={s.counts}>
        {'🧟 ' + current.infectedLeft + ' infected  ·  🙂 ' + current.survivorsLeft + (current.survivorsLeft === 1 ? ' survivor' : ' survivors') + ' left'}
      </Text>}
    </View>
  </Animated.View>;
}

const s = StyleSheet.create({
  banner: { position: 'absolute', left: 12, right: 12, top: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: party.ink,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  infected: { backgroundColor: '#1d0f12' },
  cured: { backgroundColor: '#0f1d14' },
  eliminated: { backgroundColor: '#15161c' },
  icon: { fontSize: 20 },
  body: { flex: 1, gap: 2 },
  text: { color: '#fff', fontSize: 16, fontWeight: '800' },
  counts: { color: '#ffd2d6', fontSize: 14, fontWeight: '700' },
});
