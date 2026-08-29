import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { createPayment, getBillingSettings, getSubscriptionQuote, submitManualPayment } from '@/features/subscriptions/api';
import { uploadPaymentProof } from '@/features/subscriptions/proof';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { BillingCycle } from '@/features/subscriptions/types';

export default function PaymentScreen() {
  const params = useLocalSearchParams<{ planId: string; cycle: BillingCycle; keepCompanyId?: string }>();
  const { membership, businesses } = useAuth();
  const { plans } = useSubscription();
  const plan = plans.find((item) => item.id === params.planId);
  const cycle: BillingCycle = params.cycle === 'annual' ? 'annual' : 'monthly';
  const companyId = membership?.companyId ?? '';
  const [method, setMethod] = useState<'orange_money' | 'stripe'>('orange_money');
  const [reference, setReference] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [proofPath, setProofPath] = useState<string | null>(null);
  const settings = useQuery({ queryKey: ['billing-settings'], queryFn: getBillingSettings });
  const quote = useQuery({ queryKey: ['subscription-quote', companyId, params.planId, cycle, appliedPromo], queryFn: () => getSubscriptionQuote(companyId, params.planId, cycle, appliedPromo), enabled: !!companyId && !!params.planId });
  const proof = useMutation({ mutationFn: () => uploadPaymentProof(companyId), onSuccess: (path) => path && setProofPath(path) });
  const manual = useMutation({
    mutationFn: () => submitManualPayment({ companyId, planId: params.planId, billingCycle: cycle, reference, proofPath, promoCode: appliedPromo }),
    onSuccess: (transactionId) => router.replace({ pathname: '/(subscription)/status' as never, params: { transactionId } }),
  });
  const stripe = useMutation({
    mutationFn: () => createPayment({ companyId, planId: params.planId, billingCycle: cycle, provider: 'stripe' }),
    onSuccess: async (result) => {
      if (result.authorizationUrl) await Linking.openURL(result.authorizationUrl);
      router.replace({ pathname: '/(subscription)/status' as never, params: { transactionId: result.transactionId } });
    },
  });

  if (!plan || membership?.role !== 'company_admin') return <View style={styles.center}><Text>Forfait ou accès invalide.</Text></View>;
  const money = (value: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: quote.data?.currency ?? plan.currency, currencyDisplay: 'code' }).format(value);

  return <View style={styles.screen}>
    <Appbar.Header><AppBackButton fallback="/(subscription)" /><Appbar.Content title="Paiement de l’abonnement" /></Appbar.Header>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card mode="contained"><Card.Title title={plan.name} subtitle={cycle === 'monthly' ? 'Facturation mensuelle' : 'Facturation annuelle'} /><Card.Content style={styles.content}>
        <Text variant="headlineMedium" style={styles.bold}>{money(quote.data?.finalAmount ?? (cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice))}</Text>
        {!!quote.data?.discountAmount && <Text>Prix initial {money(quote.data.baseAmount)} · réduction {money(quote.data.discountAmount)}</Text>}
        {!!quote.data?.bonusDays && <Text>Avantage : {quote.data.bonusDays} jours supplémentaires</Text>}
        {!!quote.data?.promotionName && <Chip icon="ticket-percent">{quote.data.promotionName}</Chip>}
        {!!params.keepCompanyId && <Text>Entreprise conservée : {businesses.find((item) => item.companyId === params.keepCompanyId)?.companyName ?? 'Entreprise sélectionnée'}</Text>}
      </Card.Content></Card>

      <Card mode="outlined"><Card.Title title="Code promotionnel" /><Card.Content style={styles.row}>
        <TextInput style={styles.grow} mode="outlined" label="Code promo" autoCapitalize="characters" value={promoCode} onChangeText={setPromoCode} />
        <AppButton mode="outlined" loading={quote.isFetching} onPress={() => setAppliedPromo(promoCode.trim().toUpperCase())}>Appliquer</AppButton>
      </Card.Content>{!!quote.error && <Card.Content><HelperText type="error" visible>{quote.error.message}</HelperText></Card.Content>}</Card>

      <Card mode="outlined"><Card.Title title="Méthode de paiement" subtitle="Choisissez le mode de règlement" /><Card.Content style={styles.content}>
        <SegmentedButtons value={method} onValueChange={(value) => setMethod(value as typeof method)} buttons={[{ value: 'orange_money', label: 'Orange Money', icon: 'cellphone' }, { value: 'stripe', label: 'Carte / Stripe', icon: 'credit-card-outline' }]} />
        <View style={styles.paymentSummary}>
          <Text variant="labelLarge">Montant à payer</Text>
          <Text variant="headlineSmall" style={styles.bold}>{money(quote.data?.finalAmount ?? 0)}</Text>
          <Text>{method === 'orange_money' ? 'Paiement mobile avec validation manuelle par le support.' : 'Paiement sécurisé par carte via Stripe.'}</Text>
        </View>
      </Card.Content></Card>

      {method === 'orange_money' ? <Card mode="outlined"><Card.Title title="Paiement Orange Money" subtitle="Validation manuelle après vérification" /><Card.Content style={styles.content}>
        <Text>Envoyez exactement <Text style={styles.bold}>{money(quote.data?.finalAmount ?? 0)}</Text> au :</Text>
        <Text selectable variant="headlineSmall" style={styles.bold}>{settings.data?.orangeMoneyNumber || 'Numéro non configuré'}</Text>
        <Text>Nom du compte : {settings.data?.orangeMoneyAccountName || 'Non configuré'}</Text>
        <TextInput mode="outlined" label="Référence de la transaction" value={reference} onChangeText={setReference} autoCapitalize="characters" />
        <AppButton mode="outlined" icon={proofPath ? 'check-circle' : 'image-plus'} loading={proof.isPending} onPress={() => proof.mutate()}>{proofPath ? 'Preuve ajoutée' : 'Ajouter une capture (facultatif)'}</AppButton>
        <HelperText type="info" visible>La capture ne peut jamais activer automatiquement votre forfait. Le Super Admin vérifiera réellement la réception.</HelperText>
        {!!proof.error && <HelperText type="error" visible>{proof.error.message}</HelperText>}
        {!!manual.error && <HelperText type="error" visible>{manual.error.message}</HelperText>}
        <AppButton icon="check" loading={manual.isPending} disabled={manual.isPending || reference.trim().length < 4 || !settings.data?.orangeMoneyNumber || !quote.data} onPress={() => manual.mutate()}>J’ai effectué le paiement</AppButton>
      </Card.Content></Card> : <Card mode="outlined"><Card.Title title="Paiement par carte via Stripe" subtitle="Activation après confirmation du prestataire et du serveur" /><Card.Content style={styles.content}>
        <Text>Vous serez redirigé vers la page de paiement hébergée par Stripe. StockMaster ne reçoit pas le numéro complet de votre carte ; Stripe traite les données de paiement selon ses propres conditions.</Text>
        {!!stripe.error && <HelperText type="error" visible>{stripe.error.message}</HelperText>}
        <AppButton icon="credit-card-check-outline" loading={stripe.isPending} disabled={!quote.data || !!appliedPromo} onPress={() => stripe.mutate()}>Payer par carte</AppButton>
        {!!appliedPromo && <HelperText type="info" visible>Le paiement Stripe avec promotion sera disponible après configuration des coupons Stripe. Retirez le code pour continuer.</HelperText>}
      </Card.Content></Card>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, page: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, paddingBottom: 44, gap: 16 },
  content: { gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, grow: { flex: 1, minWidth: 220 }, bold: { fontWeight: '800' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paymentSummary: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: '#F2F6FF' },
});
