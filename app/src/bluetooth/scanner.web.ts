export function startBluetooth(
  _myNumber: number,
  _onHeard: (playerNumber: number, rssi: number) => void,
  onStatus: (text: string, healthy?: boolean) => void,
) {
  onStatus('Open PULSE on an iPhone to detect nearby players with Bluetooth.');
}

export function stopBluetooth() {}
