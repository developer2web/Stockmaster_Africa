import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { getPaymentProofUrl } from '@/features/subscriptions/proof';
import { getPlatformPayments, reviewManualPayment, type PlatformPayment } from '@/features/superAdmin/api';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatCurrency,formatDateTime } from '@/utils/format';

export default function PlatformPayments() {
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<{ payment: PlatformPayment; approve: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['platform-payments'], queryFn: getPlatformPayments });
  const shown = useMemo(() => { const term = search.trim().toLowerCase(); return (query.data ?? []).filter(row => !term || `${row.company_name} ${row.client_email} ${row.provider_reference ?? ''} ${row.plan_name}`.toLowerCase().includes(term)); }, [query.data, search]);
  const review = useMutation({ mutationFn: () => reviewManualPayment(pending!.payment.id, pending!.approve, reason), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['platform-payments'] }); setPending(null); setReason(''); } });
  const proof = useMutation({ mutationFn: async (path: string) => Linking.openURL(await getPaymentProofUrl(path)) });
  const money = (row: PlatformPayment) => formatCurrency(row.amount,row.currency);

  if (query.isLoading) return <LoadingScreen label="Chargement des paiements…" />;

  return <PlatformPage title="Paiements">
    <AppSearchBar placeholder="Entreprise, client ou référence" value={search} onChangeText={setSearch} />
    {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
    {!!proof.error && <HelperText type="error" visible>Impossible d’ouvrir la preuve : {proof.error.message}</HelperText>}
    {shown.map(row => <Card key={row.id} mode="outlined"><Card.Content style={styles.content}><View style={styles.heading}><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{row.company_name}</Text><Text variant="headlineSmall" style={styles.bold}>{money(row)}</Text></View><StatusChip status={row.status}/></View><Text>{row.plan_name} · {row.billing_cycle === 'annual' ? 'Annuel' : 'Mensuel'}</Text><Text variant="bodySmall">{formatDateTime(row.submitted_at ?? row.created_at)}</Text><View style={styles.details}><Text selectable>Client : {row.client_email}</Text><Text>Méthode : {row.provider === 'orange_money_manual' ? 'Orange Money' : row.provider === 'stripe' ? 'Carte bancaire' : row.provider}</Text><Text selectable>Référence : {row.provider_reference ?? '—'}</Text>{Number(row.discount_amount) > 0 && <Text>Promotion : {row.promotion_name ?? 'Code promo'} · {formatCurrency(row.discount_amount,row.currency)}</Text>}{row.reviewer_name && <Text>Validé par : {row.reviewer_name}</Text>}{row.failure_reason && <Text style={styles.error}>Motif : {row.failure_reason}</Text>}</View></Card.Content><Card.Actions style={styles.actions}>{row.proof_path && <AppButton mode="outlined" icon="image-outline" loading={proof.isPending} onPress={() => proof.mutate(row.proof_path!)}>Preuve</AppButton>}{row.provider === 'orange_money_manual' && row.status === 'processing' && <AppButton mode="outlined" destructive onPress={() => setPending({ payment: row, approve: false })}>Refuser</AppButton>}{row.provider === 'orange_money_manual' && row.status === 'processing' && <AppButton icon="check" onPress={() => setPending({ payment: row, approve: true })}>Approuver</AppButton>}</Card.Actions></Card>)}
    {!query.isLoading && !shown.length && <EmptyState icon="credit-card-search-outline" title="Aucun paiement" message="Aucun paiement ne correspond à votre recherche." />}
    <Portal><Dialog visible={!!pending} dismissable={!review.isPending} onDismiss={() => !review.isPending && setPending(null)}><Dialog.Title>{pending?.approve ? 'Approuver le paiement ?' : 'Refuser le paiement ?'}</Dialog.Title><Dialog.Content style={styles.content}><Text>{pending?.payment.company_name} · {pending ? money(pending.payment) : ''}</Text>{!pending?.approve && <TextInput mode="outlined" label="Motif *" value={reason} onChangeText={setReason} multiline autoFocus />}{!!review.error && <HelperText type="error" visible>{review.error.message}</HelperText>}</Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap',gap:8 }}><AppButton mode="outlined" disabled={review.isPending} onPress={() => setPending(null)}>Annuler</AppButton><AppButton destructive={!pending?.approve} loading={review.isPending} disabled={!pending?.approve && reason.trim().length < 3} onPress={() => review.mutate()}>{pending?.approve ? 'Approuver' : 'Refuser'}</AppButton></Dialog.Actions></Dialog></Portal>
  </PlatformPage>;
}

const styles = StyleSheet.create({ content: { gap: 10 }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, copy: { flex: 1, minWidth: 0 }, bold: { fontWeight: '800' }, details: { gap: 5 }, actions: { flexWrap: 'wrap', justifyContent: 'flex-start', gap: 6 }, error: { color: '#C92A2A' } });
