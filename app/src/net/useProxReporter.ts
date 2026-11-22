/**
 * While a round is running, broadcast my server-assigned bleId, scan for
 * everyone else, and report HOT/WARM/COLD to the server every 500 ms.
 * The server decides whether bites/heals are in range: we only report.
 */
import { useEffect } from 'react';
import type { ProxReading, RoomView } from '../../../shared/protocol';
import { ProximityTracker } from '../bluetooth/proximity';
import { startBluetooth, stopBluetooth } from '../bluetooth/scanner';
import { send, useGameStore } from './client';

function reportLabReadings(readings: ProxReading[]) {
    send('prox:report', { readings });
}

export function useProxReporter(onStatus: (text: string) => void) {
    const { view } = useGameStore();
    useRoomProximity(view, reportLabReadings, onStatus);
}

export function useRoomProximity(
    view: RoomView | null,
    report: ((readings: ProxReading[]) => void) | undefined,
    onStatus: (text: string, healthy?: boolean) => void,
) {
    const bleId = view?.me?.bleId ?? null;
    const roundLive = view?.phase === 'countdown' || view?.phase === 'playing';
    const active = roundLive && view?.me?.status === 'active';

    useEffect(() => {
        if (!active || bleId === null || !report) return;
        const tracker = new ProximityTracker();
        let scanning = true;
        try {
            startBluetooth(bleId, (n, rssi) => tracker.add(n, rssi), (message, healthy) => {
                if (scanning) onStatus(message, healthy);
            });
        } catch {
            onStatus('Bluetooth is unavailable. Open the PULSE development build on your iPhone.');
        }
        const timer = setInterval(() => {
            const readings = tracker.snapshot().map((r) => ({ bleId: r.playerNumber, zone: r.zone, rssi: r.rssi }));
            if (readings.length) report(readings);
        }, 500);
        return () => {
            clearInterval(timer);
            scanning = false;
            stopBluetooth();
        };
    }, [active, bleId, onStatus, report]);
}
