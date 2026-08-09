import { Card, Text } from 'react-native-paper';

export function StatCard({ label, value }: { label: string; value: string }) {
  return <Card style={{ flex: 1, minWidth: 145 }}><Card.Content><Text variant="labelLarge">{label}</Text><Text variant="headlineMedium">{value}</Text></Card.Content></Card>;
}
