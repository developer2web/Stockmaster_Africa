import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, Chip, HelperText, Text, useTheme } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCustomers } from '@/features/customers/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppButton } from '@/components/ui/AppButton';

export default function CustomersScreen() {
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const query = useQuery({ queryKey: ['customers', company, debounced], queryFn: () => getCustomers(company, debounced), enabled: !!company });
  const [showArchived, setShowArchived] = useState(false);
  const all = query.data ?? [];
  const archivedCount = all.filter(customer => !customer.is_active).length;
  const rows = showArchived ? all : all.filter(customer => customer.is_active);

  return (
    <AdminPage
      title="Clients"
      action={<AppButton icon="plus" testID="customer-add-fab" onPress={() => router.push('/customers/new' as never)}>Ajouter</AppButton>}
    >
      <AppSearchBar testID="customer-search-input" placeholder="Nom, téléphone ou email" value={search} onChangeText={setSearch} loading={search !== debounced} />
      {archivedCount > 0 && <Chip style={{ alignSelf: 'flex-start' }} icon="archive-outline" selected={showArchived} showSelectedCheck onPress={() => setShowArchived(value => !value)}>Afficher les archivés ({archivedCount})</Chip>}
      {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
      {rows.map((customer) => {
        const owes = (customer.balance ?? 0) > 0;
        return (
          <Card key={customer.id} testID={`customer-card-${customer.id}`} mode="contained" style={{ backgroundColor: theme.colors.surface }} onPress={() => router.push(`/customers/${customer.id}` as never)}>
            <Card.Title
              title={customer.name}
              subtitle={[!customer.is_active && 'Archivé', customer.phone ?? customer.email ?? 'Sans contact'].filter(Boolean).join(' · ')}
              right={() => (
                <Text variant="titleMedium" style={{ marginRight: 16, fontWeight: '700', color: owes ? theme.colors.error : theme.colors.primary }}>
                  {owes ? `Doit ${formatMoney(customer.balance ?? 0)}` : 'À jour'}
                </Text>
              )}
            />
          </Card>
        );
      })}
      {!query.isLoading && !rows.length && (
        <EmptyState
          icon="account-group"
          title={search ? 'Aucun résultat' : archivedCount ? 'Aucun client actif' : 'Aucun client'}
          message={search ? 'Essayez un autre nom, téléphone ou email.' : archivedCount ? 'Vos clients sont archivés : utilisez « Afficher les archivés ».' : 'Ajoutez votre premier client pour suivre son ardoise et ses achats.'}
          action={!search?<AppButton icon="plus" onPress={()=>router.push('/customers/new' as never)}>Ajouter un client</AppButton>:undefined}
        />
      )}
    </AdminPage>
  );
}
