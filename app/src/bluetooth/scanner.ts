import { BleManager, State } from 'react-native-ble-plx';
import { startAdvertising, stopAdvertising, advertiserAvailable } from '../../modules/ble-advertiser';
import { idToUuid, uuidToId } from './ids';

let manager: BleManager | null = null;
let stateSub: { remove(): void } | null = null;

/**
 * Starts broadcasting `myNumber` and scanning for other PULSE players.
 * onHeard(playerNumber, rssi) fires many times per second.
 * onStatus(text) reports problems like "Bluetooth is off".
 */
export function startBluetooth(
    myNumber: number,
    onHeard: (playerNumber: number, rssi: number) => void,
    onStatus: (text: string, healthy?: boolean) => void,
) {
    stopBluetooth();
    manager ??= new BleManager(); // first time: iPhone shows the Bluetooth permission popup

    // Wait until Bluetooth is actually on before starting.
    stateSub = manager.onStateChange(async (state) => {
        if (state === State.PoweredOff) return onStatus('Bluetooth is off: turn it on in Control Center');
        if (state === State.Unauthorized) return onStatus('Bluetooth permission denied: allow it in Settings › PULSE');
        if (state !== State.PoweredOn) return;

        // 1. Listen. No filter (we don't know everyone's ID), duplicates ON so signal keeps updating.
        manager!.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
            if (error) return onStatus('Scan error: ' + error.message);
            if (!device?.serviceUUIDs || device.rssi == null) return;
            for (const uuid of device.serviceUUIDs) {
                const n = uuidToId(uuid);
                if (n && n !== myNumber) onHeard(n, device.rssi);
            }
        });

        // 2. Broadcast.
        if (!advertiserAvailable) return onStatus('This phone can scan. Install the PULSE development build so others can detect you.');
        try {
            await startAdvertising(idToUuid(myNumber));
            onStatus('Bluetooth on: broadcasting + scanning', true);
        } catch (e: any) {
            onStatus('Scanning, but broadcast failed: ' + e.message);
        }
    }, true);
}

export function stopBluetooth() {
    stateSub?.remove();
    stateSub = null;
    manager?.stopDeviceScan();
    stopAdvertising();
}
