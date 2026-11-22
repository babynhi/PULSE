import type { Role, Zone } from '../../../shared/protocol';

// The road map has its own palette so a room theme cannot change what a signal means.
export const mapColors = {
  innocent: '#7fb3ff',
  doctor: '#5dd39e',
  infected: '#e63946',
  amber: '#f4a261',
  background: '#07090f',
  text: '#f2f4f8',
  white: '#fff',
  muted: '#8b93a7',
  player: '#4285f4',
  zoneOutside: 'rgba(226,68,78,0.28)',
  zoneEdge: '#172e46',
  pingHalo: 'rgba(60,66,82,0.25)',
  pingEdge: 'rgba(60,66,82,0.7)',
  pingCore: '#4a5163',
} as const;

export const streetStyles = [
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f1eee8' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#dedad3' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#47515a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#add8e8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d7e7c1' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

export function roleRadarTint(role: Role | null | undefined) {
  return role ? mapColors[role] : mapColors.muted;
}

export function radarBaseSize(width: number) {
  return Math.max(0, Math.min(width - 80, 300));
}

export const radarBands: Record<Zone | 'NONE', { text: string; color: string; period: number; glow: number }> = {
  HOT: { text: 'YOU ARE NOT ALONE!', color: mapColors.infected, period: 700, glow: 1 },
  WARM: { text: 'Movements detected', color: mapColors.amber, period: 1300, glow: 0.7 },
  COLD: { text: "It's quiet...", color: mapColors.infected, period: 2600, glow: 0.35 },
  NONE: { text: "It's quiet...", color: mapColors.infected, period: 2600, glow: 0.35 },
};
