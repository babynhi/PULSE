import { useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RadarScope, SignalLabel } from '../rooms/RadarScope';
import { mapColors } from '../rooms/radarStyle';
import type { PracticeMapProps } from './PracticeMap';

// An illustrated practice neighborhood. Live GPS coordinates are never drawn on this map.
const roads = [
  'M-420 -190 L-125 -144 L73 -177 L420 -216',
  'M-420 -112 L-130 -86 L-4 -45 Q12 -42 4 -9 L-9 19 L-420 -5',
  'M-420 164 L-124 117 L105 65 L420 28',
  'M-420 226 L-104 176 L106 143 L420 114',
  'M-178 -480 L-197 -189 L-161 100 L-106 480',
  'M-73 -480 L-38 -215 L-5 -46',
  'M-54 102 L-5 480 M-13 92 L43 480',
  'M-18 -480 L51 -180 Q97 -36 129 64 L219 480',
  'M96 -480 L187 -195 L294 145 L414 480',
];
const labels = [
  ['W Creek Dr', -81, -152, -10], ['Maple St', -104, -74, 15], ['River Rd', 93, -16, 73],
  ['Pine Ave', -157, 44, 80], ['Park Rd', 55, 80, -13], ['Oak St', -86, 172, -10],
  ['2nd St', 12, 164, 82], ['3rd St', -37, 180, 82],
] as const;

export function PracticeMap({ band, radiusFraction }: PracticeMapProps) {
  const mask = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const side = Math.min(size.width, size.height);
  const radius = 185 * (radiusFraction ?? 1);
  return <View style={s.map} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
    {side > 0 && <svg aria-label="Illustrated practice street map" role="img" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}
      viewBox={[-195 * size.width / side, -195 * size.height / side, 390 * size.width / side, 390 * size.height / side].join(' ')}>
      <defs><mask id={mask}><rect x="-2000" y="-2000" width="4000" height="4000" fill="white" /><circle r={radius} fill="black" /></mask></defs>
      <rect x="-2000" y="-2000" width="4000" height="4000" fill="#f1eee8" />
      <path d="M-70 -900 Q-5 -320 95 -140 T197 161 T330 900" fill="none" stroke="#b0d9e9" strokeWidth="32" />
      <g fill="#d5e6bf"><path d="M-145 -67 l44 12 -9 25 -46 -7Z M110 16 l26 -7 14 50 -25 6Z M-144 115 l33 -6 18 49 -41 9Z" /></g>
      {roads.map(d => <g key={d}><path d={d} fill="none" stroke="#dcd9d3" strokeWidth="5" /><path d={d} fill="none" stroke="white" strokeWidth="3.8" /></g>)}
      {labels.map(([name,x,y,angle]) => <text key={name} transform={`translate(${x} ${y}) rotate(${angle})`} fill="#414b54" fontFamily="sans-serif" fontSize="8" textAnchor="middle">{name}</text>)}
      {radiusFraction !== null && <><rect x="-2000" y="-2000" width="4000" height="4000" fill={mapColors.zoneOutside} mask={`url(#${mask})`} />
        <circle r={radius} fill="none" stroke={mapColors.zoneEdge} strokeWidth="2" strokeDasharray="9 5" /></>}
    </svg>}
    {side > 0 && <RadarScope size={side * 0.63} zone={band} tint={mapColors.player} />}
    <SignalLabel band={band} />
    <Text style={s.credit}>Practice map</Text>
  </View>;
}

const s = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1eee8' },
  credit: { position: 'absolute', bottom: 3, left: 6, fontSize: 11, color: '#49525a', backgroundColor: '#ffffffcc' },
});
