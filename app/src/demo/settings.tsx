import { createContext, type ReactNode, useContext, useState } from 'react';
import { DEFAULT_SETTINGS, ZONE_WARNING_MS, type Settings } from '../../../shared/protocol';

export interface DemoSettings extends Settings {
  zoneWarningSec: number;
  pingIntervalSec: number;
  pingDurationSec: number;
}

const defaults: DemoSettings = {
  ...DEFAULT_SETTINGS,
  zoneStartRadiusM: 100,
  zoneWarningSec: ZONE_WARNING_MS / 1000,
  pingIntervalSec: 180,
  pingDurationSec: 30,
};

const SettingsContext = createContext<{
  settings: DemoSettings;
  canEdit: boolean;
  openRoom: (host: boolean, playerCount: number) => void;
  setSettings: (next: DemoSettings) => void;
} | null>(null);

export function DemoSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, save] = useState(defaults);
  const [canEdit, setCanEdit] = useState(false);
  function openRoom(host: boolean, playerCount: number) {
    save({ ...defaults, maxPlayers: playerCount });
    setCanEdit(host);
  }
  return <SettingsContext.Provider value={{ settings, canEdit, openRoom, setSettings: next => {
    if (canEdit) save(next);
  } }}>{children}</SettingsContext.Provider>;
}

export function useDemoSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('Demo settings require a DemoSettingsProvider.');
  return context;
}
