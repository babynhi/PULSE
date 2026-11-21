import { createContext, type ReactNode, useContext, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/protocol';

export interface DemoSettings extends Settings {
  zoneRadiusM: number;
  zoneShrinkSec: number;
  zoneWarningSec: number;
  zoneGraceSec: number;
  pingIntervalSec: number;
  pingDurationSec: number;
}

const defaults: DemoSettings = {
  ...DEFAULT_SETTINGS,
  zoneEnabled: true,
  zoneRadiusM: 100,
  zoneShrinkSec: 180,
  zoneWarningSec: 30,
  zoneGraceSec: 10,
  pingIntervalSec: 180,
  pingDurationSec: 30,
};

const SettingsContext = createContext<{
  settings: DemoSettings;
  canEdit: boolean;
  openRoom: (host: boolean) => void;
  setSettings: (next: DemoSettings) => void;
} | null>(null);

export function DemoSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, save] = useState(defaults);
  const [canEdit, setCanEdit] = useState(false);
  function openRoom(host: boolean) {
    save(defaults);
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
