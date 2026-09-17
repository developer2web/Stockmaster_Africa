import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';

// Audit externe (PDF, SM-05) : une adresse inconnue tombait sur la page
// d'erreur générique de l'hébergeur (en anglais, avec un identifiant
// technique interne, aucun lien de retour) — le problème principal était
// que Vercel ne redirigeait même pas vers cet écran (voir vercel.json côté
// scripts/prepare-web-export-for-vercel.cjs), mais expo-router n'avait de
// toute façon aucun écran "introuvable" personnalisé pour prendre le relais.
export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page introuvable' }} />
      <View style={styles.page}>
        <Icon source="map-marker-question-outline" size={64} color="#084B50" />
        <Text variant="headlineSmall" style={styles.title}>Cette page n’existe pas</Text>
        <Text style={styles.body}>L’adresse demandée ne correspond à aucun écran de StockMaster. Vérifiez le lien, ou retournez à l’accueil.</Text>
        <Link href="/" asChild><AppButton icon="home-outline">Retour à l’accueil</AppButton></Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, backgroundColor: '#F7F9F8' },
  title: { fontWeight: '800', color: '#084B50', textAlign: 'center' },
  body: { textAlign: 'center', color: '#53665F', maxWidth: 360 },
});
