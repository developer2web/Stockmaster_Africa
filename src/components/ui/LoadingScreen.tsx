import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  return <View style={{ flex: 1, gap: 16, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" /><Text>{label}</Text></View>;
}
