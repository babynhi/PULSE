/**
 * While a round is running, broadcast my server-assigned bleId, scan for
 * everyone else, and report HOT/WARM/COLD to the server every 500 ms.
 * The server decides whether bites/heals are in range: we only report.
 */
import { useEffect, useRef } from 'react';
import { ProximityTracker } from '../bluetooth/proximity';
import { startBluetooth, stopBluetooth } from '../bluetooth/scanner';
import { send, useGameStore } from './client';

export function useProxReporter(onStatus: (text: string) => void = () => { }) {
    const { view } = useGameStore();
    const bleId = view?.me?.bleId ?? null;
    const roundLive = view?.phase === 'countdown' || view?.phase === 'playing';
    const active = roundLive && bleId !== null;

    // Keep the latest callback without restarting Bluetooth when it changes.
    const statusRef = useRef(onStatus);
    useEffect(() => {
        statusRef.current = onStatus;
    }, [onStatus]);

    useEffect(() => {
        if (!active || bleId === null) return;
        const tracker = new ProximityTracker();
        startBluetooth(
            bleId,
            (n, rssi) => tracker.add(n, rssi),
            (t) => statusRef.current(t),
        );
        const timer = setInterval(() => {
            const readings = tracker.snapshot().map((r) => ({ bleId: r.playerNumber, zone: r.zone, rssi: r.rssi }));
            send('prox:report', { readings });
        }, 500);
        return () => {
            clearInterval(timer);
            stopBluetooth();
        };
    }, [active, bleId]);
}
