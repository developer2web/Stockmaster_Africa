import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Dialog, HelperText, Icon, Portal, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { CASH_PAGE_SIZE, createCashTransaction, getCashSummary, getCashTransactions } from '@/features/cash/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { parseDecimal } from '@/utils/number';

type TransactionType = 'deposit' | 'withdrawal';

export default function CashScreen() {
  const { formatMoney: money, formatForCurrency } = useCurrency();
  const { membership } = useAuth();
  const theme = useTheme();
  const cache = useQueryClient();
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const canWrite = membership?.role === 'company_admin' || !!membership?.permissions.includes('cash_transactions.write') || !!membership?.permissions.includes('expenses.write');
  const query = useInfiniteQuery({
    queryKey: ['cash-transactions', companyId, storeId],
    queryFn: ({ pageParam }) => getCashTransactions(companyId, storeId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === CASH_PAGE_SIZE ? pages.length : undefined,
    enabled: !!companyId && !!storeId,
  });
  const summary = useQuery({
    queryKey: ['cash-summary', companyId, storeId],
    queryFn: () => getCashSummary(storeId),
    enabled: !!companyId && !!storeId,
  });
  const [type, setType] = useState<TransactionType | null>(null);
  const [designation, setDesignation] = useState('');
  const [amount, setAmount] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const rows = query.data?.pages.flat() ?? [];
  const deposits = summary.data?.deposits ?? 0;
  const withdrawals = summary.data?.withdrawals ?? 0;
  const balance = summary.data?.balance ?? 0;
  const mutation = useMutation({
    mutationFn: () => createCashTransaction({ companyId, storeId, type: type!, designation, amount: parseDecimal(amount) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['cash-transactions', companyId, storeId] });
      await cache.invalidateQueries({ queryKey: ['cash-summary', companyId, storeId] });
      setType(null);
      setDesignation('');
      setAmount('');
      setSuccessMessage(type === 'deposit' ? 'Fonds ajoutés avec succès.' : 'Dépense enregistrée avec succès.');
    },
  });
  const valid = !!storeId && designation.trim().length >= 2 && parseDecimal(amount) > 0;

  return (
    <AdminPage title="Caisse">
      <Card mode="contained" style={[styles.balance, { backgroundColor: theme.colors.primaryContainer }]}>
        <Card.Content style={styles.balanceContent}>
          <View style={[styles.wallet, { backgroundColor: theme.colors.primary }]}><Icon source="wallet-outline" size={32} color={theme.colors.onPrimary} /></View>
          <View style={styles.grow}>
            <Text style={{ color: theme.colors.onPrimaryContainer }}>Solde de {membership?.storeName ?? 'la boutique'}</Text>
            <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>{money(balance)}</Text>
          </View>
        </Card.Content>
      </Card>
      {canWrite && <View style={styles.actions}>
        <AppButton style={styles.action} icon="cash-plus" onPress={() => setType('deposit')}>Ajouter des fonds</AppButton>
        <AppButton style={styles.action} buttonColor={theme.colors.error} icon="cash-minus" onPress={() => setType('withdrawal')}>Effectuer une dépense</AppButton>
      </View>}
      <View style={styles.summary}>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Entrées</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.primary }]}>{money(deposits)}</Text></Card.Content></Card>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Sorties</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.error }]}>{money(withdrawals)}</Text></Card.Content></Card>
      </View>
      <Text variant="titleLarge" style={styles.bold}>Historique des mouvements</Text>
      {rows.map((item) => (
        <Card key={item.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.transaction}>
            <View style={[styles.transactionIcon, { backgroundColor: item.transaction_type === 'deposit' ? theme.colors.primaryContainer : theme.colors.errorContainer }]}>
              <Icon source={item.transaction_type === 'deposit' ? 'arrow-down-left' : 'arrow-up-right'} size={23} color={item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error} />
            </View>
            <View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{item.designation}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.store?.name ?? 'Toutes les boutiques'} · {new Date(item.created_at).toLocaleString('fr-CA')}</Text></View>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.amount, styles.bold, { color: item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error }]}>{item.transaction_type === 'deposit' ? '+' : '−'}{formatForCurrency(Number(item.amount), item.currency_code)}</Text>
          </Card.Content>
        </Card>
      ))}
      {query.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>Charger plus de mouvements</AppButton>}
      {!query.isLoading && !rows.length && <EmptyState icon="wallet-outline" title="Caisse vide" message="Ajoutez un premier approvisionnement pour démarrer l’historique." />}
      {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
      <Portal><Dialog visible={!!type} onDismiss={() => setType(null)}><Dialog.Title>{type === 'deposit' ? 'Ajouter des fonds' : 'Effectuer une dépense'}</Dialog.Title><Dialog.Content style={styles.dialog}><TextInput mode="outlined" label="Désignation" value={designation} onChangeText={setDesignation} /><TextInput mode="outlined" label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} />{!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}</Dialog.Content><Dialog.Actions><AppButton mode="text" onPress={() => setType(null)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={!valid || mutation.isPending} buttonColor={type === 'withdrawal' ? theme.colors.error : undefined} onPress={() => mutation.mutate()}>Confirmer</AppButton></Dialog.Actions></Dialog></Portal>
      <Snackbar visible={!!successMessage} onDismiss={() => setSuccessMessage('')} duration={3000}>{successMessage}</Snackbar>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  balance: { borderRadius: 26 },
  balanceContent: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  wallet: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: { flexGrow: 1, flexBasis: 240 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { flexGrow: 1, flexBasis: 220, borderRadius: 20 },
  transaction: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { maxWidth: '42%', textAlign: 'right' },
  transactionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dialog: { gap: 12 },
});
