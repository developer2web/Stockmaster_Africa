import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { readableError } from '@/utils/errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { CASH_PAGE_SIZE, closeCash, createCashTransaction, getCashClosures, getCashSessionStatus, getCashSummary, getCashTransactions, openCash } from '@/features/cash/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { parseDecimal } from '@/utils/number';
import { printPaymentReceipt, sharePaymentReceipt } from '@/features/payments/receipt';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { useReceiptBranding } from '@/features/payments/branding';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { formatDateTime } from '@/utils/format';

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
  const closures = useQuery({ queryKey: ['cash-closures', companyId, storeId], queryFn: () => getCashClosures(companyId, storeId), enabled: !!companyId && !!storeId });
  const sessionStatus=useQuery({queryKey:['cash-session',companyId,storeId],queryFn:()=>getCashSessionStatus(storeId),enabled:!!companyId&&!!storeId});
  const [type, setType] = useState<TransactionType | null>(null);
  const [designation, setDesignation] = useState('');
  const [amount, setAmount] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [closureOpen,setClosureOpen]=useState(false);
  const [countedAmount,setCountedAmount]=useState('');
  const [closureNote,setClosureNote]=useState('');
  const [openingAmount,setOpeningAmount]=useState('');
  const [openingNote,setOpeningNote]=useState('');
  const receiptAction=useReceiptAction();
  const receiptBranding=useReceiptBranding();
  const rows = query.data?.pages.flat() ?? [];
  const deposits = summary.data?.deposits ?? 0;
  const withdrawals = summary.data?.withdrawals ?? 0;
  const balance = summary.data?.balance ?? 0;
  const mutation = useMutation({
    mutationFn: () => createCashTransaction({ companyId, storeId, type: type!, designation, amount: parseDecimal(amount) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['cash-transactions', companyId, storeId] });
      await cache.invalidateQueries({ queryKey: ['cash-summary', companyId, storeId] });
      await invalidateOperationalSummaries(cache, companyId, storeId);
      setType(null);
      setDesignation('');
      setAmount('');
      setSuccessMessage(type === 'deposit' ? 'Fonds ajoutés avec succès.' : 'Dépense enregistrée avec succès.');
    },
  });
  const valid = !!storeId && designation.trim().length >= 2 && parseDecimal(amount) > 0;
  const closure=useMutation({mutationFn:()=>closeCash(storeId,parseDecimal(countedAmount),closureNote),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['cash-closures',companyId,storeId]}),cache.invalidateQueries({queryKey:['cash-session',companyId,storeId]})]);setClosureOpen(false);setCountedAmount('');setClosureNote('');setSuccessMessage('Caisse clôturée avec succès. Une nouvelle validation sera exigée à la reprise.');}});
  const opening=useMutation({mutationFn:()=>openCash(storeId,parseDecimal(openingAmount),openingNote),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['cash-session',companyId,storeId]});setOpeningAmount('');setOpeningNote('');setSuccessMessage('Montant initial validé. La caisse est ouverte.');}});
  const requiresOpening=!!sessionStatus.data?.requiresOpening;

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
      {requiresOpening&&<Card mode="contained" style={{backgroundColor:theme.colors.errorContainer}}><Card.Title title="Validation du montant initial obligatoire" subtitle={`Dernière clôture par ${sessionStatus.data?.closedByLabel??'un utilisateur'}`} left={()=><Icon source="cash-lock" size={30} color={theme.colors.error}/>}/><Card.Content style={styles.dialog}><Text>Montant transmis : {money(sessionStatus.data?.expectedInitial??0)}</Text><TextInput mode="outlined" label="Montant réellement reçu" value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad"/><TextInput mode="outlined" label="Note en cas d’écart (facultatif)" value={openingNote} onChangeText={setOpeningNote} multiline/><Text>Écart : {money((parseDecimal(openingAmount)||0)-(sessionStatus.data?.expectedInitial??0))}</Text>{!!opening.error&&<HelperText type="error" visible>{opening.error.message}</HelperText>}</Card.Content><Card.Actions><AppButton icon="cash-check" loading={opening.isPending} disabled={opening.isPending||openingAmount.trim()===''||parseDecimal(openingAmount)<0} onPress={()=>opening.mutate()}>Valider et commencer</AppButton></Card.Actions></Card>}
      {canWrite && <View style={styles.actions}>
        <AppButton disabled={requiresOpening} style={styles.action} icon="cash-plus" onPress={() => setType('deposit')}>Ajouter des fonds</AppButton>
        <AppButton disabled={requiresOpening} style={styles.action} buttonColor={theme.colors.error} icon="cash-minus" onPress={() => setType('withdrawal')}>Effectuer une dépense</AppButton>
      </View>}
      <View style={styles.summary}>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Entrées</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.primary }]}>{money(deposits)}</Text></Card.Content></Card>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Sorties</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.error }]}>{money(withdrawals)}</Text></Card.Content></Card>
      </View>
      {canWrite&&<Card mode="outlined"><Card.Title title="Clôture de caisse" subtitle="La caisse peut être clôturée plusieurs fois dans la journée" left={()=><Icon source="cash-register" size={28}/>}/><Card.Actions><AppButton disabled={requiresOpening} icon="lock-check-outline" onPress={()=>{setCountedAmount(String(balance));setClosureOpen(true);}}>Clôturer la caisse</AppButton></Card.Actions></Card>}
      {!!closures.data?.length&&<><Text variant="titleLarge" style={styles.bold}>Dernières clôtures</Text>{closures.data.slice(0,7).map(item=>{
        const receipt={...receiptBranding,title:'Bordereau de clôture de caisse',party:membership?.storeName??receiptBranding.store??'Boutique',partyLabel:'Caisse',amount:Number(item.counted_amount),balanceBefore:0,balanceAfter:0,date:item.created_at,reference:`CLOTURE-${item.id.slice(0,8).toUpperCase()}`,issuedBy:item.closed_by_label,amountLabel:'Montant compté',note:`Montant attendu : ${money(Number(item.expected_amount))} • Écart : ${money(Number(item.difference))}${item.note?` • ${item.note}`:''}`,showBalances:false};
        const printKey=`closure-print-${item.id}`; const shareKey=`closure-share-${item.id}`;
        return <Card key={item.id} mode="outlined"><Card.Title title={new Date(`${item.closure_date}T12:00:00`).toLocaleDateString('fr-FR')} subtitle={`Attendu ${money(Number(item.expected_amount))} • Compté ${money(Number(item.counted_amount))}`} subtitleNumberOfLines={2} right={()=><Text numberOfLines={1} style={{marginRight:16,maxWidth:'35%',color:Number(item.difference)===0?theme.colors.primary:theme.colors.error,fontWeight:'800'}}>{Number(item.difference)>0?'+':''}{money(Number(item.difference))}</Text>}/><Card.Content><Text style={styles.bold}>Clôture effectuée par : {item.closed_by_label}</Text>{item.note&&<Text>{item.note}</Text>}</Card.Content><Card.Actions><AppButton mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(receipt,money))}>Imprimer</AppButton><AppButton mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(receipt,money))}>Partager</AppButton></Card.Actions></Card>;
      })}</>}
      <Text variant="titleLarge" style={styles.bold}>Historique des mouvements</Text>
      {rows.map((item) => (
        <Card key={item.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.transaction}>
            <View style={[styles.transactionIcon, { backgroundColor: item.transaction_type === 'deposit' ? theme.colors.primaryContainer : theme.colors.errorContainer }]}>
              <Icon source={item.transaction_type === 'deposit' ? 'arrow-down-left' : 'arrow-up-right'} size={23} color={item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error} />
            </View>
            <View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{item.designation}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.store?.name ?? 'Toutes les boutiques'} · {formatDateTime(item.created_at)}</Text></View>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.amount, styles.bold, { color: item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error }]}>{item.transaction_type === 'deposit' ? '+' : '−'}{formatForCurrency(Number(item.amount), item.currency_code)}</Text>
          </Card.Content>
          <Card.Actions>{(()=>{const data={...receiptBranding,title:item.transaction_type==='deposit'?'Reçu d’entrée de caisse':'Reçu de sortie de caisse',party:item.designation,partyLabel:'Opération',amount:Number(item.amount),balanceBefore:0,balanceAfter:0,date:item.created_at,reference:`CAISSE-${item.id.slice(0,8).toUpperCase()}`,store:item.store?.name??receiptBranding.store,issuedBy:item.creator?.full_name||receiptBranding.issuedBy,amountLabel:item.transaction_type==='deposit'?'Montant encaissé':'Montant décaissé',showBalances:false};const printKey=`print-${item.id}`,shareKey=`share-${item.id}`;return [<AppButton key={printKey} mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(data,value=>formatForCurrency(value,item.currency_code)))}>Imprimer</AppButton>,<AppButton key={shareKey} mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(data,value=>formatForCurrency(value,item.currency_code)))}>Partager</AppButton>]})()}</Card.Actions>
        </Card>
      ))}
      {query.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>Charger plus de mouvements</AppButton>}
      {!query.isLoading && !rows.length && <EmptyState icon="wallet-outline" title="Caisse vide" message="Ajoutez un premier approvisionnement pour démarrer l’historique." />}
      {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
      <Portal><Dialog visible={!!type} onDismiss={() => setType(null)}><Dialog.Title>{type === 'deposit' ? 'Ajouter des fonds' : 'Effectuer une dépense'}</Dialog.Title><Dialog.Content style={styles.dialog}><TextInput mode="outlined" label="Désignation" value={designation} onChangeText={setDesignation} /><TextInput mode="outlined" label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} />{!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}</Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={() => setType(null)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={!valid || mutation.isPending} buttonColor={type === 'withdrawal' ? theme.colors.error : undefined} onPress={() => mutation.mutate()}>Confirmer</AppButton></Dialog.Actions></Dialog><Dialog visible={closureOpen} onDismiss={()=>!closure.isPending&&setClosureOpen(false)}><Dialog.Title>Clôturer la caisse</Dialog.Title><Dialog.Content style={styles.dialog}><Text>Montant attendu : {money(balance)}</Text><TextInput mode="outlined" label="Montant réellement compté" value={countedAmount} onChangeText={setCountedAmount} keyboardType="decimal-pad"/><TextInput mode="outlined" label="Note (facultatif)" value={closureNote} onChangeText={setClosureNote} multiline/><Text>Écart : {money((parseDecimal(countedAmount)||0)-balance)}</Text>{!!closure.error&&<HelperText type="error" visible>{closure.error.message}</HelperText>}</Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" disabled={closure.isPending} onPress={()=>setClosureOpen(false)}>Annuler</AppButton><AppButton loading={closure.isPending} disabled={closure.isPending||parseDecimal(countedAmount)<0} onPress={()=>closure.mutate()}>Valider la clôture</AppButton></Dialog.Actions></Dialog></Portal>
      <AppFeedback message={successMessage} onDismiss={() => setSuccessMessage('')} />
      <AppFeedback message={receiptAction.error ? readableError(receiptAction.error) : ''} type="error" onDismiss={receiptAction.clearError} />
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
