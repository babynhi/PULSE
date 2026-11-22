/**
 * While a round is running, broadcast my server-assigned bleId, scan for
 * everyone else, and report HOT/WARM/COLD to the server every 500 ms.
 * The server decides whether bites/heals are in range: we only report.
 */
import { useEffect, useRef, useState } from 'react';
import type { Zone } from '../../../shared/protocol';
import { ProximityTracker } from '../bluetooth/proximity';
import { startBluetooth, stopBluetooth } from '../bluetooth/scanner';
import { getSocket, useGameStore } from './client';

export function useProxReporter(onStatus?: (text: string, healthy?: boolean) => void) {
    const { view } = useGameStore();
    const [heard, setHeard] = useState<Record<number, Zone>>({});
    const statusRef = useRef(onStatus);
    useEffect(() => { statusRef.current = onStatus; }, [onStatus]);
    const bleId = view?.me?.bleId ?? null;
    const roundLive = view?.phase === 'countdown' || view?.phase === 'playing';
    const active = roundLive && view?.me?.status === 'active';

    useEffect(() => {
        if (!active || bleId === null) return;
        const socket = getSocket();
        const tracker = new ProximityTracker();
        let scanning = true;
        try {
            startBluetooth(bleId, (n, rssi) => tracker.add(n, rssi), (message, healthy) => {
                if (scanning) statusRef.current?.(message, healthy);
            });
        } catch {
            statusRef.current?.('Bluetooth is unavailable. Open the PULSE development build on your iPhone.');
        }
        const timer = setInterval(() => {
            const readings = tracker.snapshot().map((r) => ({ bleId: r.playerNumber, zone: r.zone, rssi: r.rssi }));
            if (socket.connected && readings.length) socket.volatile.emit('prox:report', { readings });
            setHeard(previous => readings.length === Object.keys(previous).length &&
                readings.every(r => previous[r.bleId] === r.zone)
                ? previous : Object.fromEntries(readings.map(r => [r.bleId, r.zone])));
        }, 500);
        return () => {
            clearInterval(timer);
            scanning = false;
            stopBluetooth();
            setHeard({});
        };
    }, [active, bleId]);
    return heard;
}
