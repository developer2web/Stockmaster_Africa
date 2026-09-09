import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { useOffline } from '@/features/offline/OfflineProvider';

type TransactionType = 'deposit' | 'withdrawal';

export default function CashScreen() {
  const { formatMoney: money, formatForCurrency } = useCurrency();
  const { membership } = useAuth();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const cache = useQueryClient();
  const { refreshQueue } = useOffline();
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const canWrite = membership?.role === 'company_admin' || !!membership?.permissions.includes('cash_transactions.write') || !!membership?.permissions.includes('expenses.write');
  const canOpen = membership?.role === 'company_admin'
    || !!membership?.permissions.includes('cash.open')
    || !!membership?.permissions.includes('cash_transactions.write');
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
  const [openingOpen, setOpeningOpen] = useState(false);
  const [previousClosuresOpen, setPreviousClosuresOpen] = useState(false);
  const receiptAction=useReceiptAction();
  const receiptBranding=useReceiptBranding();
  const rows = query.data?.pages.flat() ?? [];
  const deposits = summary.data?.deposits ?? 0;
  const withdrawals = summary.data?.withdrawals ?? 0;
  const balance = summary.data?.balance ?? 0;
  const mutation = useMutation({
    mutationFn: () => createCashTransaction({ companyId, storeId, type: type!, designation, amount: parseDecimal(amount) }),
    onSuccess: async (result) => {
      if (result.queued) {
        await refreshQueue();
      } else {
        await cache.invalidateQueries({ queryKey: ['cash-transactions', companyId, storeId] });
        await cache.invalidateQueries({ queryKey: ['cash-summary', companyId, storeId] });
        await invalidateOperationalSummaries(cache, companyId, storeId);
      }
      setType(null);
      setDesignation('');
      setAmount('');
      setSuccessMessage(result.queued
        ? 'Opération conservée hors ligne. Elle sera confirmée après synchronisation.'
        : type === 'deposit' ? 'Fonds ajoutés' : 'Dépense enregistrée');
    },
  });
  const valid = !!storeId && designation.trim().length >= 2 && parseDecimal(amount) > 0;
  const closure=useMutation({mutationFn:()=>closeCash(storeId,parseDecimal(countedAmount),closureNote),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['cash-closures',companyId,storeId]}),cache.invalidateQueries({queryKey:['cash-session',companyId,storeId]})]);setClosureOpen(false);setCountedAmount('');setClosureNote('');setSuccessMessage('Caisse clôturée');}});
  const opening=useMutation({mutationFn:()=>openCash(storeId,parseDecimal(openingAmount),openingNote),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['cash-session',companyId,storeId]});setOpeningOpen(false);setOpeningAmount('');setOpeningNote('');setSuccessMessage('Caisse ouverte');}});
  const requiresOpening=!!sessionStatus.data?.requiresOpening;
  const parsedOpeningAmount = parseDecimal(openingAmount);
  const validOpeningAmount = Number.isFinite(parsedOpeningAmount) && parsedOpeningAmount >= 0;
  const openingDifference=(parsedOpeningAmount||0)-(sessionStatus.data?.expectedInitial??0);

  return (
    <AdminPage title="Caisse" description="">
      <Card mode="contained" style={[styles.balance, { backgroundColor: theme.colors.primaryContainer }]}>
        <Card.Content style={styles.balanceContent}>
          <View style={[styles.wallet, { backgroundColor: theme.colors.primary }]}><Icon source="wallet-outline" size={32} color={theme.colors.onPrimary} /></View>
          <View style={styles.grow}>
            <Text style={{ color: theme.colors.onPrimaryContainer }}>Solde de {membership?.storeName ?? 'la boutique'}</Text>
            <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>{money(balance)}</Text>
          </View>
        </Card.Content>
      </Card>
      {requiresOpening && <Card mode="outlined" style={{ borderColor: theme.colors.outlineVariant }}>
        <Card.Content style={styles.openingNotice}>
          <View style={styles.openingNoticeCopy}>
            <Icon source="cash-lock" size={24} color={theme.colors.primary} />
            <View style={styles.grow}>
              <Text variant="titleSmall" style={styles.bold}>Montant initial requis</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Montant transmis : {money(sessionStatus.data?.expectedInitial ?? 0)}</Text>
            </View>
          </View>
          {canOpen
            ? <AppButton mode="outlined" icon="cash-check" onPress={() => setOpeningOpen(true)}>Ouvrir la caisse</AppButton>
            : <HelperText type="error" visible>Un administrateur doit vous attribuer la permission « Ouvrir la caisse ».</HelperText>}
        </Card.Content>
      </Card>}
      {canWrite && <View style={styles.actions}>
        <AppButton disabled={requiresOpening} style={styles.action} icon="cash-plus" onPress={() => setType('deposit')}>Ajouter des fonds</AppButton>
        <AppButton disabled={requiresOpening} style={styles.action} buttonColor={theme.colors.error} icon="cash-minus" onPress={() => setType('withdrawal')}>Effectuer une dépense</AppButton>
        <AppButton mode="outlined" disabled={requiresOpening} style={styles.action} icon="lock-check-outline" onPress={() => { setCountedAmount(String(balance)); setClosureOpen(true); }}>Clôturer la caisse</AppButton>
      </View>}
      <View style={styles.summary}>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Entrées</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.primary }]}>{money(deposits)}</Text></Card.Content></Card>
        <Card mode="contained" style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Sorties</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.error }]}>{money(withdrawals)}</Text></Card.Content></Card>
      </View>
      {!!closures.data?.length && <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: previousClosuresOpen }}
        aria-expanded={previousClosuresOpen}
        onPress={() => setPreviousClosuresOpen(open => !open)}
        style={({ pressed }) => [styles.closuresToggle, { borderColor: theme.colors.outlineVariant, backgroundColor: pressed ? theme.colors.surfaceVariant : theme.colors.surface }]}
      >
        <Text style={[styles.grow, styles.bold, { color: theme.colors.primary }]}>{previousClosuresOpen ? 'Masquer les clôtures précédentes' : 'Voir les clôtures précédentes'}</Text>
        <Icon source={previousClosuresOpen ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.primary} />
      </Pressable>}
      {previousClosuresOpen && closures.data?.slice(0,7).map(item=>{
        const receipt={...receiptBranding,title:'Bordereau de clôture de caisse',party:membership?.storeName??receiptBranding.store??'Boutique',partyLabel:'Caisse',amount:Number(item.counted_amount),balanceBefore:0,balanceAfter:0,date:item.created_at,reference:`CLOTURE-${item.id.slice(0,8).toUpperCase()}`,issuedBy:item.closed_by_label,amountLabel:'Montant compté',note:`Montant attendu : ${money(Number(item.expected_amount))} • Écart : ${money(Number(item.difference))}${item.note?` • ${item.note}`:''}`,showBalances:false};
        const printKey=`closure-print-${item.id}`; const shareKey=`closure-share-${item.id}`;
        const difference=Number(item.difference);
        return <Card key={item.id} mode="outlined" style={styles.closureCard}><Card.Content style={styles.closureContent}><View style={styles.closureHeader}><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{new Date(`${item.closure_date}T12:00:00`).toLocaleDateString('fr-FR')}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>Attendu {money(Number(item.expected_amount))} • Compté {money(Number(item.counted_amount))}</Text></View><View style={[styles.differenceBadge,{backgroundColor:difference===0?theme.colors.primaryContainer:theme.colors.errorContainer}]}><Text style={[styles.differenceLabel,{color:difference===0?theme.colors.primary:theme.colors.error}]}>Écart</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.differenceAmount,{color:difference===0?theme.colors.primary:theme.colors.error}]}>{difference>0?'+':''}{money(difference)}</Text></View></View><Text style={styles.bold}>Clôture effectuée par : {item.closed_by_label}</Text>{item.note&&<Text>{item.note}</Text>}</Card.Content><Card.Actions style={styles.closureActions}><AppButton mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(receipt,money))}>Imprimer</AppButton><AppButton mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(receipt,money))}>Partager</AppButton></Card.Actions></Card>;
      })}
      <Text variant="titleLarge" style={styles.bold}>Historique des mouvements</Text>
      {rows.map((item) => (
        <Card key={item.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.transaction}>
            <View style={[styles.transactionIcon, { backgroundColor: item.transaction_type === 'deposit' ? theme.colors.primaryContainer : theme.colors.errorContainer }]}>
              <Icon source={item.transaction_type === 'deposit' ? 'arrow-down-left' : 'arrow-up-right'} size={23} color={item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error} />
            </View>
            <View style={styles.transactionCopy}><Text variant="titleMedium" style={styles.bold}>{item.designation}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.store?.name ?? 'Toutes les boutiques'} · {formatDateTime(item.created_at)}</Text></View>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.amount, styles.bold, { color: item.transaction_type === 'deposit' ? theme.colors.primary : theme.colors.error }]}>{item.transaction_type === 'deposit' ? '+' : '−'}{formatForCurrency(Number(item.amount), item.currency_code)}</Text>
          </Card.Content>
          <Card.Actions>{(()=>{const data={...receiptBranding,title:item.transaction_type==='deposit'?'Reçu d’entrée de caisse':'Reçu de sortie de caisse',party:item.designation,partyLabel:'Opération',amount:Number(item.amount),balanceBefore:0,balanceAfter:0,date:item.created_at,reference:`CAISSE-${item.id.slice(0,8).toUpperCase()}`,store:item.store?.name??receiptBranding.store,issuedBy:item.creator?.full_name||receiptBranding.issuedBy,amountLabel:item.transaction_type==='deposit'?'Montant encaissé':'Montant décaissé',showBalances:false};const printKey=`print-${item.id}`,shareKey=`share-${item.id}`;return [<AppButton key={printKey} mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(data,value=>formatForCurrency(value,item.currency_code)))}>Imprimer</AppButton>,<AppButton key={shareKey} mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(data,value=>formatForCurrency(value,item.currency_code)))}>Partager</AppButton>]})()}</Card.Actions>
        </Card>
      ))}
      {query.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>Charger plus de mouvements</AppButton>}
      {!query.isLoading && !rows.length && <EmptyState icon="wallet-outline" title="Caisse vide" message="Ajoutez un premier approvisionnement pour démarrer l’historique." />}
      {!!query.error && <HelperText type="error" visible>{readableError(query.error)}</HelperText>}
      <Portal>
        <Dialog visible={openingOpen && requiresOpening && canOpen} dismissable={!opening.isPending} onDismiss={() => !opening.isPending && setOpeningOpen(false)} style={[styles.openingDialog, { width: Math.min(460, width - 32) }]}>
          <Dialog.Title>Ouvrir la caisse</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: Math.max(80, height * 0.45) }} contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled">
              <Text>Montant transmis : <Text style={styles.bold}>{money(sessionStatus.data?.expectedInitial ?? 0)}</Text></Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Dernière clôture par {sessionStatus.data?.closedByLabel ?? 'un utilisateur'}. Confirmez le montant réellement reçu.</Text>
              <TextInput mode="outlined" dense label="Montant reçu" value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad" />
              <TextInput mode="outlined" dense label="Note en cas d’écart (facultatif)" value={openingNote} onChangeText={setOpeningNote} multiline />
              {validOpeningAmount && <Text style={{ color: openingDifference === 0 ? theme.colors.primary : theme.colors.error }}>Écart : {openingDifference > 0 ? '+' : ''}{money(openingDifference)}</Text>}
              {!!opening.error && <HelperText type="error" visible>{readableError(opening.error)}</HelperText>}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ flexWrap: 'wrap' }}>
            <AppButton mode="text" disabled={opening.isPending} onPress={() => setOpeningOpen(false)}>Annuler</AppButton>
            <AppButton icon="cash-check" loading={opening.isPending} disabled={opening.isPending || !validOpeningAmount} onPress={() => opening.mutate()}>Valider et commencer</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal><Dialog visible={!!type} onDismiss={() => setType(null)}><Dialog.Title>{type === 'deposit' ? 'Ajouter des fonds' : 'Effectuer une dépense'}</Dialog.Title><Dialog.ScrollArea><ScrollView style={{ maxHeight: Math.max(80, height * 0.45) }} contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled"><TextInput mode="outlined" label="Désignation" value={designation} onChangeText={setDesignation} /><TextInput mode="outlined" label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} />{!!mutation.error && <HelperText type="error" visible>{readableError(mutation.error)}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={() => setType(null)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={!valid || mutation.isPending} onPress={() => mutation.mutate()}>{mutation.isPending?'Enregistrement…':'Confirmer'}</AppButton></Dialog.Actions></Dialog><Dialog visible={closureOpen} onDismiss={()=>!closure.isPending&&setClosureOpen(false)}><Dialog.Title>Clôturer la caisse</Dialog.Title><Dialog.ScrollArea><ScrollView style={{ maxHeight: Math.max(80, height * 0.45) }} contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled"><Text>Montant attendu : {money(balance)}</Text><TextInput mode="outlined" label="Montant réellement compté" value={countedAmount} onChangeText={setCountedAmount} keyboardType="decimal-pad"/><TextInput mode="outlined" label="Note (facultatif)" value={closureNote} onChangeText={setClosureNote} multiline/><Text>Écart : {money((parseDecimal(countedAmount)||0)-balance)}</Text>{!!closure.error&&<HelperText type="error" visible>{readableError(closure.error)}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" disabled={closure.isPending} onPress={()=>setClosureOpen(false)}>Annuler</AppButton><AppButton loading={closure.isPending} disabled={closure.isPending||parseDecimal(countedAmount)<0} onPress={()=>closure.mutate()}>{closure.isPending?'Enregistrement…':'Valider la clôture'}</AppButton></Dialog.Actions></Dialog></Portal>
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
  transaction: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  transactionCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  amount: { maxWidth: '100%', textAlign: 'right', flexShrink: 1 },
  transactionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  openingNotice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 12 },
  openingNoticeCopy: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  openingDialog: { alignSelf: 'center', marginHorizontal: 0 },
  dialogScroll: { gap: 12, paddingVertical: 12 },
  closuresToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 12 },
  closureCard: { overflow: 'hidden' },
  closureContent: { gap: 10, paddingTop: 16 },
  closureHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  differenceBadge: { minWidth: 116, maxWidth: '100%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'flex-end' },
  differenceLabel: { fontSize: 12, fontWeight: '700' },
  differenceAmount: { fontWeight: '900', maxWidth: 180 },
  closureActions: { flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8 },
});
