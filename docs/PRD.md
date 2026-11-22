# **Product Requirements Document (PRD)**

## **Multiplayer Infection Survival Game**

**Game Type:** Real-world multiplayer, location-based party survival game  
**Working Title:** TBD

---

# **1\. Product Overview**

## **1.1 Concept**

A real-world multiplayer survival game in which players are secretly assigned one of three roles: Infected, Innocent, or Doctor.

Players physically move around a designated play area while using their phones to detect nearby players through Bluetooth proximity signals. Infected players attempt to infect everyone, innocents attempt to survive, and the doctor attempts to protect survivors by curing infected players.

A shrinking safe zone forces players into increasingly smaller areas as the game progresses.

The game combines hidden roles, physical movement, proximity detection, infection mechanics, and battle royale-style zone restrictions.

## **1.2 Core Gameplay Loop**

**Disperse → Detect → Chase → Bite → Cure → Survive → Shrink → Repeat**

The objective is to create a fast-paced social experience in which players must physically move, make strategic decisions, and react to changing information.

## **1.3 Target Experience**

The game should:

* Be easy to understand within the first two minutes.  
* Support quick setup for groups of friends.  
* Encourage physical movement and interaction.  
* Create tension through incomplete information.  
* Make each round unpredictable.  
* Avoid requiring players to constantly stare at their screens.  
* Support replayability through customizable settings and different player counts.

---

# **2\. Player Roles**

There are three roles, each with different objectives and radar visibility.

## **2.1 Infected**

**Objective:** Infect all other players before the timer expires.

Abilities:

* Can identify other infected players on their radar.  
* Can detect nearby non-infected players through anonymous proximity signals.  
* Can infect players using the Bite mechanic.  
* Are immune to bites from other infected players.  
* Can coordinate with other infected players.

Restrictions:

* Cannot bite another infected player.  
* Cannot heal themselves.  
* Cannot be infected by another infected player.

When an infected player successfully bites an innocent or doctor, the target becomes infected.

## **2.2 Innocent**

**Objective:** Survive until the game timer expires without becoming infected or being eliminated by the safe zone.

Abilities:

* Can detect nearby players through anonymous proximity signals.  
* Can use the radar to understand nearby player activity.  
* Can escape infected players by moving away.

Restrictions:

* Cannot identify the roles of nearby players through the radar.  
* Cannot cure other players.  
* Can become infected through a successful Bite.

## **2.3 Doctor**

**Objective:** Protect the surviving players by curing infected players.

Abilities:

* Can detect nearby players through anonymous proximity signals.  
* Can cure infected players using the Heal mechanic.  
* Has two healing charges by default.

Restrictions:

* Cannot heal themselves.  
* Cannot heal an innocent who has not been infected.  
* Cannot heal after their healing charges are exhausted.  
* If the doctor becomes infected, the game ends immediately in an infected victory.

The doctor is part of the survivor team for victory calculations.

---

# **3\. Game Setup and Lobby**

## **3.1 Opening Screen**

The application should open with a simple landing screen.

Primary actions:

* Host Game  
* Join Game  

## **3.2 Permissions**

The application requires access to:

* Bluetooth: Detect nearby players.  
* Location: Determine whether players are inside the safe zone.  
* Notifications: Optional game alerts.

Permissions should be requested contextually, with an explanation of why each is needed.

The game should clearly indicate when a required permission is missing.

## **3.3 Hosting a Game**

When a player selects Host Game:

* A new private game room is created.  
* A unique room code is generated.  
* The host enters the lobby.  
* Other players can join using the room code.

The host configures game settings and marks themselves ready to start the round with the group.

## **3.4 Joining a Game**

Players can join through:

* Entering a room code.  
* Opening a shared invitation link, if supported.

The application must handle:

* Room not found.  
* Room full.  
* Game already started.  
* Duplicate player names.  
* Failed connection.

Duplicate names should be resolved by automatically appending a number or asking the player to choose another name.

A share button should be available next to the room code, supporting native sharing options such as text messages and AirDrop where available.

## **3.5 Lobby Interface**

The lobby should display:

* Room code at the top.  
* Player list.  
* Player connection status.  
* Game settings.  
* Ready status.  
* One Ready button at the bottom for each player, including the host.

All players can view the settings, but only the host can modify them.

Setting changes must update in real time for everyone. A small visual highlight should indicate when a setting changes.

## **3.6 Lobby Controls**

Host controls:

* Change game settings.  
* Kick players.  
* Transfer host privileges.  
* Mark themselves Ready or undo readiness while waiting for the group.

Player controls:

* Mark themselves Ready.  
* Leave the lobby.  
* Rejoin the lobby if disconnected.

The round starts automatically once:

* At least three players have joined.  
* All connected players are Ready.  
* Required connectivity checks have passed.

The application should warn the host if the selected number of infected players is too high for the current group size.

## **3.7 Host Migration**

If the host disconnects or leaves:

* The game must continue.  
* Host privileges should automatically transfer to another eligible connected player.  
* The new host receives access to host controls.  
* Existing game settings and player states must be preserved.

---

# **4\. Game Settings**

The host can customize the following settings before starting.

| Setting | Default |
| ----- | ----- |
| Game duration | 15 minutes |
| Number of infected | 1 |
| Doctor | 1 |
| Doctor healing charges | 2 |
| Safe zone | Enabled |
| Zone mode | GPS-based |
| Starting zone size | Host configurable |
| Disperse time | 30 seconds |
| Player ping interval | 3 minutes |
| Ping duration | Up to 30 seconds |
| Zone shrink interval | 3 minutes |
| Zone warning | 30 seconds |
| Outside-zone grace period | 10 seconds |
| Bite duration | 2 seconds |
| Heal duration | 2 seconds |
| Post-heal immunity | 10 seconds |
| Reconnection window | Configurable, proposed default 30 seconds |

At 10 or more players, the application should suggest increasing the number of infected players to two.

The host retains the ability to override this recommendation.

The number of players and infected roles must always be validated before starting.

---

# **5\. Pre-Game Sequence**

## **5.1 Bluetooth and Location Calibration**

Before the round begins, players should gather together.

The application should:

* Confirm that Bluetooth is enabled.  
* Confirm that required location permissions are available.  
* Check whether nearby player devices can be detected.  
* Record initial Bluetooth signal measurements.  
* Record starting location readings.  
* Identify devices that cannot be detected reliably.

Calibration should establish a baseline for proximity estimation, not assume that Bluetooth signal strength provides an exact distance.

If a player fails calibration, the host should receive a warning before starting.

## **5.2 Countdown and Dispersal**

Once all checks are completed:

* The group starts the round by marking themselves ready in the lobby.
* A 30-second countdown begins.  
* Players receive a message indicating that they should disperse.  
* Role reveal becomes available after the countdown.

## **5.3 Role Assignment**

Each player receives one randomly assigned role.

Roles must remain private.

Players tap a button to reveal their role. Once revealed:

* The role is displayed with its objective.  
* The player confirms they have understood their role.  
* The role is hidden again.  
* The role must not remain visible on the main game screen.

During the round, players can tap **View role** to recheck their current role and objective. Tapping **Hide role** or leaving the app conceals the role again.

The role is stored internally so the application can enforce the correct permissions and gameplay rules.

---

# **6\. Main Gameplay Mechanics**

## **6.1 Bluetooth Proximity Detection**

Bluetooth Low Energy (BLE) is used to detect nearby players.

Every active player's phone participates in Bluetooth advertising and scanning, subject to operating-system permissions and restrictions.

The system should:

* Identify nearby registered player devices.  
* Estimate proximity using Bluetooth signal strength.  
* Distinguish registered players from unrelated Bluetooth devices.  
* Avoid exposing player identities or roles unnecessarily.  
* Continue operating reliably while the application is active.

Bluetooth signal strength is not an exact distance measurement. The application should use proximity categories rather than promise precise distances.

### **Proximity Categories**

The radar should use three proximity categories:

* **HOT:** Very close.  
* **WARM:** Nearby.  
* **COLD:** Further away.

The categories should be calibrated through real-device testing.

The radar should not require players to constantly look at their screens. Visual indicators and vibration should communicate proximity.

## **6.2 Role-Based Radar**

The radar interface should be customized according to the player's role.

Suggested color scheme:

* Infected: Red.  
* Innocent: Blue.  
* Doctor: Green.

### **Infected Radar**

* Other infected players are identifiable.  
* Non-infected players appear as anonymous proximity signals.  
* Infected players cannot see the roles of non-infected players.  
* Infected teammates should be distinguishable from potential targets.

### **Innocent Radar**

* Nearby players appear as anonymous proximity signals.  
* Players cannot identify whether someone is infected or the doctor.  
* The radar communicates proximity, not identity or role.

### **Doctor Radar**

* Nearby players appear as anonymous proximity signals.  
* The doctor cannot identify infected players through the radar.  
* The doctor must use proximity and gameplay interactions to locate potential patients.

No radar should reveal another player's role.

## **6.3 Player Pings**

Pings provide temporary information about nearby players.

Default configuration:

* One ping every three minutes.  
* Maximum display duration of 30 seconds.

When a ping occurs:

* The player receives an updated indication of nearby registered players.  
* Nearby player signals are displayed temporarily on the radar.  
* The ping does not reveal another player's role.  
* The ping disappears after its duration expires.

Ping visibility must respect the player's role-based radar permissions.

The host can customize ping frequency before the round begins.

## **6.4 Bite Mechanic**

Infected players can infect other players through physical proximity.

Conditions:

1. An infected player approaches a valid target.  
2. The target must be within the estimated bite proximity threshold.  
3. The Bite button becomes available.  
4. The infected player holds the Bite button for two seconds.  
5. The infected player must remain within proximity throughout the interaction.  
6. The infection succeeds once the interaction is completed.

Important rules:

* The target does not need to press anything.  
* Walking past another player must not automatically cause infection.  
* The target receives a vibration and visual notification when successfully infected.  
* The target's role and radar immediately update.  
* Infected players cannot bite other infected players.  
* A player who has just been cured receives 10 seconds of immunity against reinfection.

If the infected player moves outside the valid proximity threshold or cancels the interaction, the bite progress resets.

## **6.5 Infection State**

Each player has an internal infection state.

Possible states:

* Innocent.  
* Infected.  
* Cured.  
* Eliminated.  
* Disconnected.

When an innocent becomes infected:

* Their role changes to Infected.  
* Their radar changes to the infected interface.  
* They gain access to infected-only information.  
* Their previous innocent abilities are removed.

When an infected player is cured:

* Their role returns to Innocent.  
* Their radar changes to the innocent interface.  
* They receive 10 seconds of reinfection immunity.

The application must synchronize infection states across all connected devices.

## **6.6 Heal Mechanic**

The doctor can cure infected players.

Default configuration:

* Two healing charges.  
* Two-second healing interaction.  
* No self-healing.

Conditions:

1. The doctor approaches an infected player.  
2. The target must be within the estimated healing proximity threshold.  
3. The Heal button becomes available.  
4. The doctor holds Heal for two seconds.  
5. The doctor must remain within proximity throughout the interaction.  
6. One healing charge is consumed.  
7. The infected player returns to the Innocent role.

After a successful heal:

* The target receives a visual and vibration notification.  
* Their radar changes to the innocent interface.  
* A 10-second immunity countdown begins.  
* They cannot be reinfected during this period.

The doctor cannot heal an innocent player or themselves.

If the doctor becomes infected, the game ends immediately in an infected victory.

---

# **7\. Safe Zone System**

## **7.1 Overview**

A safe zone appears on the game map and gradually shrinks throughout the round.

The purpose is to:

* Prevent players from spreading too far apart.  
* Encourage encounters.  
* Create urgency.  
* Increase the difficulty as the round progresses.

The safe zone can be enabled or disabled by the host.

When disabled, the game operates in House Party Mode without GPS-based elimination.

## **7.2 Zone Configuration**

The host can configure:

* Zone center.  
* Starting zone size.  
* Whether the zone is enabled.

The zone center can be selected using:

* The host's current location.  
* A manually selected map pin.

The zone should be large enough to accommodate normal GPS inaccuracies. A starting radius of at least 30 metres is recommended, subject to testing and play-area size.

## **7.3 Zone Shrinking**

Default configuration:

* Zone shrinks every three minutes.  
* A 30-second warning appears before each shrink.  
* Approximately five shrink events occur during a 15-minute game.

The map should display:

* Current safe zone.  
* Outline of the next safe zone.  
* Player's current location, when location access is available.

The main gameplay screen should prioritize:

* Distance to the safe zone.  
* Direction toward the safe zone.  
* Countdown until elimination.

Example: "38 m to safe zone."

## **7.4 Outside-Zone Detection**

When a player leaves the safe zone:

* The screen edges turn red.  
* A countdown appears.  
* The phone vibrates with increasing frequency as the deadline approaches.  
* The player has 10 seconds to return.

The application must not eliminate players based on a single GPS reading.

Instead:

* Multiple consecutive location readings should confirm that the player is outside.  
* GPS accuracy should be considered.  
* The 10-second grace period must be enforced.  
* Temporary location errors should not cause unfair elimination.

If the player does not return before the countdown expires, they are eliminated.

## **7.5 House Party Mode**

When the host disables the safe zone:

* GPS-based elimination is disabled.  
* Players can move freely within the play area.  
* Infection and healing mechanics remain active.  
* The game ends through its normal victory conditions.

---

# **8\. Player Disconnection and Reconnection**

Disconnection must not be exploitable as a way to avoid infection.

When a player disconnects:

* Their status changes to Disconnected.  
* They are temporarily protected from being bitten or healed.  
* Their current infection state is preserved.  
* Their role and game progress are retained.  
* A reconnection countdown begins.

Proposed default reconnection window: 30 seconds.

When the player reconnects:

* Their previous role and infection state are restored.  
* Their device resumes Bluetooth participation.  
* Their radar and game interface are restored.

If the player fails to reconnect within the allowed period:

* They are marked as eliminated.  
* They are removed from active radar participation.  
* They cannot rejoin the current round.

The system should distinguish between a temporary connection interruption and a deliberate exit whenever possible.

---

# **9\. Elimination**

Players can be eliminated through the safe-zone system.

When eliminated:

* The player receives an elimination notification.  
* Their screen transitions to an eliminated interface.  
* They can no longer participate in infection or healing.  
* Their phone stops participating in active player radar detection.  
* They cannot influence the outcome of the current round.

Eliminated players should not be able to reveal information about other players' positions or roles to active participants.

---

# **10\. Game End Conditions**

The game ends when one of the following conditions is met.

## **10.1 Infected Victory**

The infected team wins when:

* All surviving players have become infected.  
* The doctor becomes infected.

The doctor becoming infected results in an immediate infected victory.

## **10.2 Survivor Victory**

The survivor team wins when:

* At least one innocent or the doctor remains uninfected when the timer expires.

The doctor counts as a survivor for victory purposes.

## **10.3 End-of-Game Screen**

The game should display:

* Winning team.  
* Total game duration.  
* Number of players infected.  
* Number of players cured.  
* Number of eliminated players.  
* Final player standings.

### **Infection Tree**

The round recap shows how infection spread:

* Each player who started infected anchors a tree. Branches connect each successful bite to the player it infected.
* Screen reader labels include bite times. Cures are marked on the corresponding infection, and a reinfection gets its own branch.
* The summary card identifies the doctor. If bitten, the doctor is also marked on their branch. Cured players show who healed them.
* Final standings show who survived and each player's final role.

Sharing a game recap card is planned.

Any player can bring the group back to the same lobby for a rematch. Players mark themselves ready again before it starts.

---

# **11\. User Interface Requirements**

The application should prioritize a simple, readable interface.

## **11.1 Main Gameplay Screen**

The main screen should contain:

* Role-specific radar.  
* Current proximity indicators.  
* Bite or Heal button when applicable.  
* Game timer.  
* Safe-zone status.  
* Distance and direction to the safe zone when enabled.  
* Player status notifications.

The interface should avoid overcrowding.

## **11.2 Visual Feedback**

The application should use:

* Color changes.  
* Vibration.  
* Countdown animations.  
* Temporary notifications.  
* Clear button states.

Important interactions must not depend on sound alone.

Examples:

* Nearby infected: proximity warning.  
* Successful infection: red visual transition and vibration.  
* Successful cure: green visual transition and vibration.  
* Outside safe zone: red screen edges and countdown.  
* Zone shrinking: warning notification.

---

# **12\. Technical Requirements and Constraints**

## **12.1 Bluetooth**

Use Bluetooth Low Energy (BLE) for proximity detection.

Technical considerations:

* BLE advertising and scanning.  
* Device identification and player association.  
* RSSI-based proximity estimation.  
* Signal smoothing and calibration.  
* Duplicate signal filtering.  
* Battery consumption.  
* iOS and Android background-operation restrictions.

The application must not assume Bluetooth signal strength provides reliable exact distances.

## **12.2 Location**

Use device location services for:

* Initial location calibration.  
* Safe-zone boundaries.  
* Player position.  
* Outside-zone detection.

GPS should be used independently from Bluetooth proximity detection.

## **12.3 Game Synchronization**

A central authoritative game-state system should manage:

* Player membership.  
* Assigned roles.  
* Infection states.  
* Healing charges.  
* Timers.  
* Zone progression.  
* Eliminations.  
* Victory conditions.

The system must prevent clients from independently declaring successful infections, heals, or eliminations without validating the relevant conditions.

## **12.4 Cross-Platform Support**

Platform-specific Bluetooth and location limitations must be tested.

The first prototype should prioritize reliable gameplay while the application is active. Background Bluetooth operation should not be assumed until validated on real devices.

## **12.5 Privacy and Security**

The application should:

* Explain Bluetooth and location usage.  
* Collect only the information necessary for gameplay.  
* Avoid exposing player identities unnecessarily.  
* Avoid retaining precise location histories without a clear requirement.  
* Protect private room and player information.  
* Stop active game tracking after the round ends.

---

# **13\. MVP Scope and Development Priorities**

The initial release should focus on proving the core gameplay experience.

## **Phase 1: Core Prototype**

**Goal: Establish whether the infection gameplay works.**

Required:

* Host and Join.  
* Room codes.  
* Basic lobby.  
* Player list.  
* Ready check.  
* Role assignment.  
* Role-specific radar.  
* BLE proximity detection.  
* Bite mechanic.  
* Heal mechanic.  
* Infection state synchronization.  
* Game timer.  
* Victory conditions.

## **Phase 2: Full Gameplay**

**Goal: Introduce the survival and zone mechanics.**

Required:

* GPS integration.  
* Safe-zone creation.  
* Zone shrinking.  
* Zone warnings.  
* Outside-zone detection.  
* Elimination.  
* Disconnection and reconnection.  
* Host migration.  
* Configurable settings.

## **Phase 3: Polish and Replayability**

**Goal: Improve the overall player experience.**

Planned:

* Infection tree.  
* Shareable recap cards.  
* Improved animations.  
* Sound and vibration customization.  
* Additional game modes.  
* Expanded customization.  
* Improved radar visualization.  
* Performance and battery optimization.

## **Optional Features — Not Required for MVP**

### **Floor Detection**

A future version may use the phone's barometer to estimate floor-level differences.

The purpose would be to prevent bites between players who are physically close horizontally but on different floors.

This feature should be excluded from the initial prototype because it requires additional calibration and testing.

---

## **Agreed changes (Nov 22, 2026)**

* **Short rounds by default:** 6-minute rounds (host can still choose any length), 20 s dispersal, a 100 m starting zone that shrinks every 90 s, with a 20 s warning.
* **Danger pulse:** survivors (innocent and doctor) get a danger level from the server: how close the nearest infected player is (never who). WARM/HOT makes the screen edge pulse red and the phone vibrate in a heartbeat that speeds up when HOT. Infected players never get it.
* **Anonymous kill feed:** everyone sees brief name-free banners: "Someone was infected… 3 survivors left", "Someone was cured", "Someone left the zone and was eliminated".
* **Round awards:** the recap adds MVPs (most infections, longest survivor, best doctor, patient zero). (The shareable image card was removed.)
* **Locked-phone play:** during the countdown and round the app keeps running in the background (background location with the blue indicator, Bluetooth central/peripheral background modes, scanning for the room's player IDs) and sends lock-screen alerts for danger, being infected and zone warnings. iOS slows Bluetooth updates in the background, so locked-phone proximity is less precise than with the app open.
* **Demo players:** the host can add 3 simulated players who walk on fake GPS near the host; demo rooms ping every 10 s (released 5 s late).
* **Rounds are 6 to 8 minutes** (default 6); the server clamps the setting to that range.
* **Map by role:** innocents and the doctor see nobody else on their map (only themselves, the zone and infection markers); they rely on the danger pulse. Infected see fellow infected live, and survivors only as pings that the server fuzzes 20-40 m and holds back (sampled every 30 s, shown 15 s later), each labelled with its age ("30s ago"). Exact survivor positions never reach a phone.
* **Doctor is not immune:** the doctor can be bitten. Infected win when the doctor is infected or everyone is infected; survivors win if time runs out otherwise (or if every infected is cured/eliminated).
* **Heal window:** the doctor can only cure someone infected less than 60 s ago (patient zero's clock starts with the round). After that the infection is permanent: the server rejects the heal and the app hides Hold to Heal for that target.
* **Infection events:** each infection shows an in-app banner with how many infected and survivors are left, a lock-screen notification "Someone was infected" when the app is backgrounded, and an anonymous marker near the spot (fuzzed 5-15 m) on everyone's map that fades out over 60 s.
* **Heartbeat:** the server also sends a coarse 0-1 closeness (never who). The heartbeat has 4 steps: far = slow soft tap and faint glow; WARM close = medium double beat; HOT = fast heavy warning buzz; touching = a full phone vibration every beat with a thick red edge.
* **Profile icons:** on Host and Join each player picks one of 40 original black-and-white creature icons (20 heads, each white-on-black or black-on-white). Every player in a room has a different one: the server gives a free icon if yours is taken, and you can change it in the lobby, where taken ones are greyed out. Rooms are capped at 40 players. Icons show in the lobby, on fellow-infected map pins (red ring), on the delayed survivor pings that infected see (amber ring, so infected know whose ping it is) and in the recap's infection tree. The infection marker and danger pulse stay anonymous.
* **Test any role (demo rooms only):** in a room with demo players, the host can pick their starting role in the lobby (Random / Innocent / Doctor / Infected), and a "Test role" button in the round switches their role on the spot by trading with a demo player, so the round keeps its infected and doctor. Hidden in rooms without demo players, so real games stay fair.
* **Story mode (demo rooms only):** a host-only lobby toggle that makes demo players follow a fixed, timed storyline through the real rules. As innocent: an infected walks up (pulse WARM to HOT) and bites you at 15 s, the doctor cures you 20 s later, and 10 s after that cures the last infected, so survivors win (about 45 s). As doctor: an infected walks up from 10 s and waits about 2 m away without biting, so you can cure it (its 60 s heal window starts at 10 s). With story mode on, demo players never bite or heal on their own.
* **Bitten mid-round:** no role reveal screen. The bitten player stays on the map, which switches to the infected view at once, with a heavy buzz and a red "You've been infected" toast that hides after 3 s.
* **Cured screen:** a cured player gets a full-screen green "You've been cured!" screen with a success buzz, then goes straight back to the survivor map.

---

# **14\. MVP Acceptance Criteria**

The prototype should not be considered successful until the following can be demonstrated with real devices.

| Test | Expected Result |
| ----- | ----- |
| Create a room | A unique room code is generated |
| Join a room | Players enter the same lobby |
| Duplicate names | Conflicts are resolved |
| Ready check | The round starts when all connected players, including the host, are ready and setup requirements are met |
| Role assignment | Each player receives the correct private role |
| Radar | Nearby registered players are detected |
| Role visibility | Radar respects role-specific information |
| Bite | Valid proximity and a two-second hold infect the target |
| Invalid bite | No infection occurs outside valid proximity |
| Heal | Doctor can cure an infected player |
| Heal limit | Doctor cannot exceed available charges |
| Reinfection protection | Cured player has 10 seconds of immunity |
| Infected immunity | Infected cannot bite other infected players |
| Doctor infection | Game immediately ends in infected victory |
| Safe zone | Players outside the zone receive a countdown |
| GPS errors | A single inaccurate reading cannot eliminate a player |
| Disconnection | Player receives temporary protection |
| Reconnection | Player's previous state is restored |
| Elimination | Eliminated players stop participating in the radar |
| Victory | Correct winning team is announced |
| Host disconnection | Game continues after host migration |

---

# **15\. Product Success Criteria**

The first playtests should evaluate:

1. **Setup time:** Can a group start a game quickly without assistance?  
2. **Understandability:** Do players understand their role and objectives?  
3. **Detection reliability:** Can Bluetooth proximity detection work consistently enough to support gameplay?  
4. **Fairness:** Do players feel that bites, heals, and eliminations are legitimate?  
5. **Engagement:** Are players physically moving and interacting rather than constantly watching their phones?  
6. **Replayability:** Do players want to start another round?  
7. **Performance:** Can the game run reliably across different iOS and Android devices?

The most important validation is whether a group of 6–10 players can complete an entire round without major technical failures or confusing gameplay.

---

# **16\. Product Vision**

The long-term vision is to create a multiplayer real-world party game that transforms ordinary physical spaces into interactive survival environments.

Rather than relying on a conventional screen-based gaming experience, the application uses real-world movement, proximity, hidden information, and social interaction as its primary gameplay mechanics.

The goal is to make every round feel different, encourage replayability, and create memorable experiences between groups of friends.

**Core product principle: The phone should facilitate the game, not become the game itself.**

