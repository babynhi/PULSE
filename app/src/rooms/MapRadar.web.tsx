import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GoogleRoadMap, worldMetersAt } from './GoogleRoadMap.web';
import { nextHeading, type HeadingTrack } from './heading';
import { allyInitials, pingOpacity } from './mapGeometry';
import { ProximityRadar, RadarScope, SignalLabel, type RadarProps } from './RadarScope';
import { mapColors, radarBaseSize, roleRadarTint } from './radarStyle';

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY?.trim();

export function MapWithRadar({ room, position, now, band, demoFallback }: RadarProps) {
  const maskId = useId();
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const [beam] = useState(() => ({ rotate: new Animated.Value(0), opacity: new Animated.Value(0) }));
  const track = useRef<HeadingTrack>({ anchor: null, heading: null });
  useEffect(() => {
    if (!position) {
      track.current = { anchor: null, heading: null };
      beam.opacity.setValue(0);
      return;
    }
    track.current = nextHeading(track.current, null, {
      latitude: position.lat, longitude: position.lng, course: position.course ?? null, speed: position.speed ?? null,
    }).track;
    if (track.current.heading != null) {
      beam.rotate.setValue(track.current.heading);
      beam.opacity.setValue(1);
    }
  }, [position, beam]);

  const tint = mapColors.player;
  if (!position) return <ProximityRadar band={band} tint={roleRadarTint(room.me?.role)} />;
  if (!apiKey || unavailable) return demoFallback ?? <ProximityRadar band={band} tint={roleRadarTint(room.me?.role)}
    message={apiKey ? 'Google Maps unavailable · Proximity only' : 'Google Maps is not configured · Proximity only'} />;

  const zone = room.zone;
  const pingAlpha = pingOpacity(room.pingAt, now);
  const flash = zone?.warning && Math.floor(now / 500) % 2 === 0;
  return <View style={styles.surface}>
    <GoogleRoadMap apiKey={apiKey} player={position} zone={zone} onUnavailable={onUnavailable}
      loading={<ProximityRadar band={band} tint={tint} message="Loading Google Maps · Proximity active" />}>
      {({ projection, width, height }) => {
        const player = projection.fromLatLngToContainerPixel(position);
        const center = zone && projection.fromLatLngToContainerPixel(zone.center);
        const radius = zone && zone.radiusM * projection.getWorldWidth() / worldMetersAt(zone.center.lat);
        const size = Math.min(radarBaseSize(width), height * 0.78);
        return <>
          <svg width={width} height={height} role="img" aria-label="North-up game radar" style={overlay}>
            {center && radius != null && <>
              <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
                <rect width={width} height={height} fill="white" />
                <circle cx={center.x} cy={center.y} r={radius} fill="black" />
              </mask></defs>
              <rect width={width} height={height} fill={mapColors.zoneOutside} mask={'url(#' + maskId + ')'} />
              <circle cx={center.x} cy={center.y} r={radius} fill="none" stroke={flash ? mapColors.infected : mapColors.zoneEdge}
                strokeWidth={flash ? 4 : 3} strokeDasharray="10 8" />
            </>}
            {pingAlpha > 0 && room.pings?.map((ping, i) => {
              const point = projection.fromLatLngToContainerPixel(ping);
              return point && <g key={i} opacity={pingAlpha}>
                <title>Approximate ping</title>
                <circle cx={point.x} cy={point.y} r="14" fill={mapColors.pingHalo} stroke={mapColors.pingEdge} />
                <circle cx={point.x} cy={point.y} r="6" fill={mapColors.pingCore} stroke={mapColors.white} strokeWidth="1.5" />
              </g>;
            })}
            {room.allies?.map(ally => {
              const point = projection.fromLatLngToContainerPixel(ally);
              return point && <g key={ally.id} transform={`translate(${point.x} ${point.y})`}>
                <title>{ally.name} · Teammate</title>
                <circle r="15" fill={mapColors.infected} stroke={mapColors.white} strokeWidth="2" />
                <text textAnchor="middle" dy="0.35em" fontSize="12" fontWeight="900" fill={mapColors.white}>{allyInitials(ally.name)}</text>
              </g>;
            })}
          </svg>
          {player && <View pointerEvents="none" style={{ position: 'absolute', left: player.x - size / 2, top: player.y - size / 2 }}>
            <RadarScope size={size} zone={band} tint={tint} beam={beam} />
          </View>}
          <SignalLabel band={band} />
        </>;
      }}
    </GoogleRoadMap>
  </View>;
}

const overlay = { position: 'absolute', inset: 0, pointerEvents: 'none' } as const;
const styles = StyleSheet.create({
  surface: { flex: 1, overflow: 'hidden', backgroundColor: mapColors.background },
});
