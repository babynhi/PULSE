# PULSE architecture

## Pieces
```
 iPhone (app/)                         Laptop (server/)
 ┌──────────────────────┐   Socket.IO   ┌────────────────────────┐
 │ BLE advertise + scan │ ───────────▶ │ index.ts  (network)    │
 │ RSSI → HOT/WARM/COLD │  prox:report  │ game.ts   (rules)      │
 │ Screens (Steven)     │ ◀─────────── │ one Room per game code │
 └──────────────────────┘   room:state  └────────────────────────┘
            shared/protocol.ts = the contract both sides import
```

## Rule #1: the server is the referee
Phones send what they *want* (ready, start a bite) and what their Bluetooth *hears*.
The server decides if a bite or heal worked. Phones never decide.

## Bluetooth
- Each player gets a number (bleId). It's hidden in a Bluetooth service UUID:
  `c0de` + 4-hex number + `-7a9e-4f1b-9c2d-1a2b3c4d5e6f`.
- Every phone advertises its own UUID and scans for others (`app/src/bluetooth`).
- RSSI is noisy: 2 s median → smoothing → zone with 3 dB hysteresis → dropped after 4 s.
- Calibrated: HOT ≥ -63 dBm (bite range), WARM ≥ -70, else COLD.

## Bite / heal validation (server)
1. Biter must be HOT with the target, heard by **either** phone (BLE is one-sided sometimes).
2. Hold 2 s. Server re-checks every 100 ms; 0.7 s grace for signal blips.
3. Readings older than 2 s don't count, so walking past someone does nothing.
4. Cured players are immune for 10 s. Doctor has 2 heals.

## Identity, reconnect, host
- Each app session has a random playerId. Rejoining with it restores role and state.
- Disconnected players are protected for 30 s, then eliminated.
- If the host leaves, the next connected player becomes host.

## Privacy
Each player gets their **own** RoomView. Other players' roles are never sent
until the end screen. Infected see fellow infected on radar; everyone else is anonymous.

## Run it
```
cd server && npm install && npm run dev   # http://<laptop-ip>:3001
npm test                                  # 22 rule tests
```
Phones and laptop must be on the same Wi-Fi.