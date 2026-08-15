import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';
import { hasAnyPermission, hasPermission } from '@/features/auth/permissions';
import type { MembershipContext } from '@/types/database';
import { useCurrency } from '@/features/currency/CurrencyProvider';

async function summary(companyId: string, storeId: string, membership: MembershipContext) {
  const total = async (table: 'sales' | 'purchases' | 'expenses' | 'payments', column: 'total' | 'amount', permission: string) => {
    if (!hasPermission(membership, permission)) return 0;
    let query = supabase.from(table).select(column).eq('company_id', companyId);
    if (table !== 'payments') query = query.eq('store_id', storeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).reduce((sum, row) => sum + Number((row as Record<string, unknown>)[column] ?? 0), 0);
  };
  const [sales, purchases, expenses, payments] = await Promise.all([
    total('sales', 'total', 'sales.read'),
    total('purchases', 'total', 'purchases.read'),
    total('expenses', 'amount', 'expenses.read'),
    total('payments', 'amount', 'payments.read'),
  ]);
  let cash = 0;
  if (hasAnyPermission(membership, ['cash_transactions.read', 'expenses.read'])) {
    const { data, error } = await supabase.from('cash_transactions').select('transaction_type,amount').eq('company_id', companyId).eq('store_id',storeId);
    if (error) throw error;
    cash = (data ?? []).reduce((sum, row) => sum + (row.transaction_type === 'deposit' ? Number(row.amount) : -Number(row.amount)), 0);
  }
  return { sales, purchases, expenses, payments, cash };
}

export default function Accounting() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const permissions = membership?.permissions ?? [];
  const query = useQuery({ queryKey: ['accounting', company, store, ...permissions], queryFn: () => summary(company, store, membership!), enabled: !!company && !!store && !!membership });
  const cards = [
    hasPermission(membership,'sales.read') && { label: 'Ventes', value: query.data?.sales ?? 0, icon: 'trending-up', color: '#084B50' },
    hasPermission(membership,'purchases.read') && { label: 'Achats', value: query.data?.purchases ?? 0, icon: 'basket-outline', color: '#1971C2' },
    hasPermission(membership,'expenses.read') && { label: 'Dépenses', value: query.data?.expenses ?? 0, icon: 'cash-minus', color: '#C92A2A', action: () => router.push('/employee/expenses' as never) },
    hasPermission(membership,'payments.read') && { label: 'Paiements', value: query.data?.payments ?? 0, icon: 'credit-card-outline', color: '#7048E8' },
    hasAnyPermission(membership,['cash_transactions.read','expenses.read']) && { label: 'Solde de caisse', value: query.data?.cash ?? 0, icon: 'wallet-outline', color: '#E67700', action: () => router.push('/employee/cash' as never) },
  ].filter(Boolean) as { label: string; value: number; icon: string; color: string; action?: () => void }[];

  return (
    <PermissionGuard permission={['sales.read', 'purchases.read', 'payments.read', 'expenses.read']}>
      <AdminPage title="Comptabilité">
        <View style={[styles.intro, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Icon source="finance" size={34} color={theme.colors.secondary} />
          <View style={styles.copy}>
            <Text variant="titleLarge" style={styles.bold}>Vue financière</Text>
            <Text style={{ color: theme.colors.onSecondaryContainer }}>Les montants disponibles selon vos permissions.</Text>
          </View>
        </View>
        {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
        <View style={styles.grid}>
          {cards.map((item) => (
            <Card
              key={item.label}
              mode="contained"
              onPress={item.action}
              style={[styles.card, { backgroundColor: theme.colors.surface }, width < 580 && styles.full]}
            >
              <Card.Content style={styles.cardContent}>
                <View style={[styles.icon, { backgroundColor: `${item.color}1F` }]}><Icon source={item.icon} size={26} color={item.color} /></View>
                <Text variant="headlineSmall" style={styles.bold}>{formatMoney(item.value)}</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>{item.label}{item.action ? ' · toucher pour gérer' : ''}</Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      </AdminPage>
    </PermissionGuard>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 22 },
  copy: { flex: 1, gap: 3 },
  bold: { fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: '46%', borderRadius: 20 },
  full: { flexBasis: '100%' },
  cardContent: { gap: 9, paddingVertical: 18 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
