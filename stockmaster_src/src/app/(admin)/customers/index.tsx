import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, FAB, HelperText, Searchbar, Text, useTheme } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCustomers } from '@/features/customers/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function CustomersScreen() {
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const query = useQuery({ queryKey: ['customers', company, debounced], queryFn: () => getCustomers(company, debounced), enabled: !!company });
  const rows = query.data ?? [];

  return (
    <AdminPage
      title="Clients"
      action={<FAB size="small" icon="plus" testID="customer-add-fab" onPress={() => router.push('/customers/new' as never)} />}
    >
      <Searchbar testID="customer-search-input" placeholder="Nom, téléphone ou email" value={search} onChangeText={setSearch} loading={search !== debounced} />
      {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
      {rows.map((customer) => {
        const owes = (customer.balance ?? 0) > 0;
        return (
          <Card key={customer.id} testID={`customer-card-${customer.id}`} mode="contained" style={{ backgroundColor: theme.colors.surface }} onPress={() => router.push(`/customers/${customer.id}` as never)}>
            <Card.Title
              title={customer.name}
              subtitle={customer.phone ?? customer.email ?? 'Sans contact'}
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
          title={search ? 'Aucun résultat' : 'Aucun client'}
          message={search ? 'Essayez un autre nom, téléphone ou email.' : 'Ajoutez votre premier client pour suivre son ardoise et ses achats.'}
        />
      )}
    </AdminPage>
  );
}
