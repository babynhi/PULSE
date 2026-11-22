import { AppState } from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';
import { startAdvertising, stopAdvertising, advertiserAvailable } from '../../modules/ble-advertiser';
import { idToUuid, uuidToId } from './ids';

let manager: BleManager | null = null;
let stateSub: { remove(): void } | null = null;
let restartTimer: ReturnType<typeof setInterval> | null = null;
let poweredOn = false;
/** The other players' Bluetooth IDs (from the room roster). */
let targets: string[] = [];
let heard: ((playerNumber: number, rssi: number) => void) | null = null;
let status: ((text: string, healthy?: boolean) => void) | null = null;
let me = 0;

/**
 * (Re)start the scan. With the roster known we scan for those exact IDs: iOS requires that for
 * scanning in the background, and it's also the only way to hear a phone whose PULSE is in the
 * background (iOS then moves its ID to the "overflow" area, invisible to a wildcard scan).
 */
function scan() {
    if (!manager || !poweredOn) return;
    manager.stopDeviceScan();
    manager.startDeviceScan(targets.length ? targets : null, { allowDuplicates: true }, (error, device) => {
        if (error) return status?.('Scan error: ' + error.message);
        if (!device || device.rssi == null) return;
        // A phone with PULSE in the background advertises its ID in the iOS "overflow" area.
        const ids = [...(device.serviceUUIDs ?? []), ...(device.overflowServiceUUIDs ?? [])];
        for (const uuid of ids) {
            const n = uuidToId(uuid);
            if (n && n !== me) heard?.(n, device.rssi);
        }
    });
}

/**
 * Starts broadcasting `myNumber` and scanning for other PULSE players.
 * onHeard(playerNumber, rssi) fires many times per second (about every 2 s in the background).
 * onStatus(text) reports problems like "Bluetooth is off".
 */
export function startBluetooth(
    myNumber: number,
    onHeard: (playerNumber: number, rssi: number) => void,
    onStatus: (text: string, healthy?: boolean) => void,
    others: number[] = [],
) {
    stopBluetooth();
    me = myNumber;
    heard = onHeard;
    status = onStatus;
    targets = others.filter((n) => n && n !== myNumber).map(idToUuid);
    manager ??= new BleManager(); // first time: iPhone shows the Bluetooth permission popup

    // Wait until Bluetooth is actually on before starting.
    stateSub = manager.onStateChange(async (state) => {
        poweredOn = state === State.PoweredOn;
        if (state === State.PoweredOff) return onStatus('Bluetooth is off: turn it on in Control Center');
        if (state === State.Unauthorized) return onStatus('Bluetooth permission denied: allow it in Settings › PULSE');
        if (!poweredOn) return;

        // 1. Listen.
        scan();

        // 2. Broadcast. Keeps going with the phone locked (bluetooth-peripheral background mode).
        if (!advertiserAvailable) return onStatus('This phone can scan. Install the PULSE development build so others can detect you.');
        try {
            await startAdvertising(idToUuid(myNumber));
            onStatus('Bluetooth on: broadcasting + scanning', true);
        } catch (e: any) {
            onStatus('Scanning, but broadcast failed: ' + e.message);
        }
    }, true);

    // In the background iOS reports each device only once per scan, so restart it every 2 s
    // to keep getting fresh signal readings while the phone is locked.
    restartTimer = setInterval(() => {
        if (AppState.currentState !== 'active') scan();
    }, 2000);
}

/** Update who we're listening for (players join, or the round starts). Restarts the scan if it changed. */
export function setScanTargets(others: number[]) {
    const next = others.filter((n) => n && n !== me).map(idToUuid).sort();
    if (next.join() === [...targets].sort().join()) return;
    targets = next;
    scan();
}

export function stopBluetooth() {
    stateSub?.remove();
    stateSub = null;
    if (restartTimer) clearInterval(restartTimer);
    restartTimer = null;
    poweredOn = false;
    manager?.stopDeviceScan();
    stopAdvertising();
}
