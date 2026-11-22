import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function defaultServerUrl() {
  if (process.env.EXPO_PUBLIC_SERVER_URL?.trim()) return process.env.EXPO_PUBLIC_SERVER_URL.trim();
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (metroHost) return `http://${metroHost}:3001`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `http://${window.location.hostname}:3001`;
  return 'http://localhost:3001';
}
