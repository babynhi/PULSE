import { Text, View } from 'react-native';
import { fieldStyles, TrackStripe } from '../ui/Menu';

export default function BluetoothLab() {
  return (
    <View style={fieldStyles.page}>
      <TrackStripe />
      <View style={fieldStyles.content}>
        <Text style={fieldStyles.body}>Open the development build on a phone to scan for nearby players.</Text>
      </View>
    </View>
  );
}
