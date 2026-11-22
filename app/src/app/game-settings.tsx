import { router } from 'expo-router';
import { useDemoSettings } from '../demo/settings';
import { RoomSettingsForm } from '../rooms/RoomSettingsForm';

export default function GameSettings() {
  const { settings, setSettings, canEdit } = useDemoSettings();
  return <RoomSettingsForm
    settings={settings}
    canEdit={canEdit}
    maxStartingInfected={settings.maxPlayers - 1}
    onSave={patch => setSettings({ ...settings, ...patch })}
    onClose={() => router.canGoBack() ? router.back() : router.replace('/')}
  />;
}
