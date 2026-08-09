import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, Text } from 'react-native-paper';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';

export function DashboardScreen({ title }: { title: string }) {
  const { membership, signOut } = useAuth();
  return <View style={styles.flex}><Appbar.Header><Appbar.Content title={title} subtitle={membership?.companyName} /><Appbar.Action icon="cog" /></Appbar.Header><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.heading}><View><Text variant="headlineMedium">Bonjour 👋</Text><Text variant="bodyLarge">Voici l’aperçu provisoire de votre activité.</Text></View><Chip icon="shield-account">{membership?.role}</Chip></View>
    <View style={styles.stats}><StatCard label="Produits" value="—" /><StatCard label="Ventes du jour" value="—" /><StatCard label="Stock faible" value="—" /></View>
    <Card><Card.Title title="Phase 1 opérationnelle" subtitle="Les données métier arrivent à partir de la Phase 2." /><Card.Content><Text>Authentification, session persistante, entreprise, boutique initiale, rôles et isolation RLS sont prêts.</Text></Card.Content></Card>
    <AppButton mode="outlined" onPress={signOut}>Se déconnecter</AppButton>
  </ScrollView></View>;
}
const styles = StyleSheet.create({ flex: { flex: 1 }, page: { padding: 20, gap: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } });
