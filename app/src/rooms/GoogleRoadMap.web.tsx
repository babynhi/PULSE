/// <reference types="google.maps" />
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LatLng, ZoneView } from '../../../shared/protocol';
import { DEFAULT_SETTINGS } from '../../../shared/protocol';
import { offsetFrom } from './mapGeometry';
import { streetStyles } from './radarStyle';

declare global {
  interface Window { gm_authFailure?: () => void }
}

const authListeners = new Set<() => void>();
let configured = false;
let authenticationFailed = false;

function loadMaps(key: string) {
  if (!configured) {
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      authenticationFailed = true;
      authListeners.forEach(listener => listener());
      previous?.();
    };
    setOptions({ key, v: 'quarterly' });
    configured = true;
  }
  return importLibrary('maps');
}

const WORLD_METERS = 2 * Math.PI * 6_378_137;
export function worldMetersAt(lat: number) {
  return WORLD_METERS * Math.cos(Math.min(85, Math.abs(lat)) * Math.PI / 180);
}

function followZoom(player: LatLng, zone: ZoneView | null, width: number, height: number) {
  const radius = zone?.radiusM ?? DEFAULT_SETTINGS.zoneStartRadiusM;
  const offset = zone ? offsetFrom(player, zone.center) : { x: 0, y: 0 };
  const scale = Math.min(width * 0.48 / (Math.abs(offset.x) + radius), height * 0.48 / (Math.abs(offset.y) + radius));
  return Math.max(0, Math.min(20, Math.log2(scale * worldMetersAt(player.lat) / 256)));
}

type Frame = { projection: google.maps.MapCanvasProjection; layer: HTMLDivElement; width: number; height: number };

/** Google owns the streets and controls. The radar is drawn in its geographic overlay pane, below attribution. */
export function GoogleRoadMap({ apiKey, player, zone, onUnavailable, loading, children }: {
  apiKey: string; player: LatLng; zone: ZoneView | null; onUnavailable: () => void;
  loading: ReactNode;
  children: (frame: Frame) => ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => ({ player, zone }));
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (authenticationFailed) { onUnavailable(); return; }
    const container = host.current!;
    let active = true;
    let overlay: google.maps.OverlayView | undefined;
    let dragListener: google.maps.MapsEventListener | undefined;
    authListeners.add(onUnavailable);
    loadMaps(apiKey).then(({ Map, OverlayView }) => {
      if (!active || authenticationFailed) return;
      const streets = new Map(container, {
        center: initial.player, zoom: followZoom(initial.player, initial.zone, container.clientWidth, container.clientHeight),
        mapTypeId: 'roadmap', styles: streetStyles, tilt: 0, heading: 0, colorScheme: 'LIGHT', clickableIcons: false,
        isFractionalZoomEnabled: true, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
        headingInteractionEnabled: false, tiltInteractionEnabled: false,
      });
      dragListener = streets.addListener('dragstart', () => setFollowing(false));
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
      const radar = new OverlayView();
      radar.onAdd = () => { radar.getPanes()?.overlayLayer.appendChild(layer); };
      radar.draw = () => {
        const projection = radar.getProjection();
        const center = streets.getCenter();
        if (!active || !center) return;
        const divPixel = projection.fromLatLngToDivPixel(center);
        const containerPixel = projection.fromLatLngToContainerPixel(center);
        if (!divPixel || !containerPixel) return;
        const width = container.clientWidth, height = container.clientHeight;
        layer.style.left = divPixel.x - containerPixel.x + 'px';
        layer.style.top = divPixel.y - containerPixel.y + 'px';
        layer.style.width = width + 'px';
        layer.style.height = height + 'px';
        setFrame({ projection, layer, width, height });
      };
      radar.onRemove = () => layer.remove();
      overlay = radar;
      radar.setMap(streets);
      setMap(streets);
    }).catch(() => { if (active) onUnavailable(); });
    return () => {
      active = false;
      authListeners.delete(onUnavailable);
      dragListener?.remove();
      overlay?.setMap(null);
      container.replaceChildren();
    };
  }, [apiKey, initial, onUnavailable]);

  const { lat, lng } = player;
  const zoom = frame ? followZoom(player, zone, frame.width, frame.height) : null;
  useEffect(() => {
    if (following) map?.setCenter({ lat, lng });
  }, [map, following, lat, lng]);
  useEffect(() => {
    if (following && zoom != null) map?.setZoom(zoom);
  }, [map, following, zoom]);

  return <>
    <div ref={host} aria-label="Google Maps street map" style={{ position: 'absolute', inset: 0, visibility: frame ? 'visible' : 'hidden' }} />
    {!frame && loading}
    {frame && createPortal(children(frame), frame.layer)}
    {!following && <button type="button" aria-label="Recenter on me" style={{ position: 'absolute', left: 8, top: 8, minHeight: 44 }}
      onClick={() => setFollowing(true)}>Recenter</button>}
  </>;
}
