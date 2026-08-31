import { router, useLocalSearchParams } from 'expo-router';
import { Card, Icon, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';

export default function ChooseStoreScreen() {
  const { stores, businesses, selectStore } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const employeeOnly = businesses.length > 0 && businesses.every((business) => business.role === 'employee');
  const choose = async (storeId: string) => {
    await selectStore(storeId);
    router.replace((returnTo || '/') as never);
  };
  return <AdminPage title="Choisir une boutique">
    <Text variant="bodyLarge">Les produits, ventes, stocks, dépenses et rapports affichés seront limités à cette boutique.</Text>
    {stores.map((store) => <Card key={store.storeId} mode="contained" onPress={() => void choose(store.storeId)}>
      <Card.Title title={store.storeName} subtitle={store.address ?? 'Adresse non renseignée'} left={() => <Icon source="store" size={30} />} />
    </Card>)}
    {!stores.length && <EmptyState icon="store-alert" title="Aucune boutique accessible" message="Ajoutez une boutique ou demandez au propriétaire de vous attribuer un accès." />}
    {!employeeOnly && businesses.length > 1 && <AppButton mode="outlined" icon="office-building" onPress={() => router.replace('/choose-business')}>Changer d’entreprise</AppButton>}
  </AdminPage>;
}
