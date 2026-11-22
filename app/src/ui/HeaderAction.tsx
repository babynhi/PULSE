import { HeaderButton } from 'expo-router/react-navigation';
import { Platform, Text } from 'react-native';
import { fieldStyles, party } from './fieldDay';

export const fieldHeaderOptions = {
  headerStyle: { backgroundColor: party.sky },
  headerTintColor: party.ink,
  headerTitleAlign: 'center',
  headerTitleStyle: { fontWeight: '800' },
  headerBackButtonDisplayMode: 'generic',
} as const;

export const headerActionTarget = { minWidth: 44, minHeight: 44, justifyContent: 'center' } as const;

interface HeaderActionProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export function HeaderAction({ label, accessibilityLabel, onPress }: HeaderActionProps) {
  return <HeaderButton accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={[headerActionTarget, Platform.OS === 'web' && { marginStart: 8 }]}>
    <Text style={fieldStyles.label}>{label}</Text>
  </HeaderButton>;
}
