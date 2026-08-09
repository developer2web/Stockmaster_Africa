import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Linking, StyleSheet, View } from 'react-native';
import { Appbar, Card, HelperText, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { createPayment } from '@/features/subscriptions/api';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { BillingCycle } from '@/features/subscriptions/types';
import { paymentRequestSchema, type PaymentRequestInput } from '@/schemas/subscriptions';
import { safeBack } from '@/utils/navigation';

export default function PaymentScreen() {
  const params = useLocalSearchParams<{ planId: string; cycle: BillingCycle }>();
  const { membership } = useAuth();
  const { plans } = useSubscription();
  const plan = plans.find((item) => item.id === params.planId);
  const cycle: BillingCycle = params.cycle === 'annual' ? 'annual' : 'monthly';
  const { control, handleSubmit } = useForm<PaymentRequestInput>({
    resolver: zodResolver(paymentRequestSchema),
    defaultValues: { phoneNumber: '', provider: 'orange_money' },
  });
  const mutation = useMutation({
    mutationFn: (input: PaymentRequestInput) => createPayment({
      companyId: membership?.companyId ?? '',
      planId: params.planId,
      billingCycle: cycle,
      phoneNumber: input.phoneNumber,
      provider: input.provider,
    }),
    onSuccess: async (result) => {
      if (result.authorizationUrl) await Linking.openURL(result.authorizationUrl);
      router.replace({
        pathname: '/(subscription)/status' as never,
        params: { transactionId: result.transactionId },
      });
    },
  });

  if (!plan || membership?.role !== 'company_admin') {
    return <View style={styles.center}><Text>Forfait ou accès invalide.</Text></View>;
  }
  const amount = cycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
  return (
    <View style={styles.screen}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => safeBack('/(subscription)')} />
        <Appbar.Content title="Paiement Mobile Money" />
      </Appbar.Header>
      <Card style={styles.card}>
        <Card.Title title={plan.name} subtitle={cycle === 'monthly' ? 'Paiement mensuel' : 'Paiement annuel'} />
        <Card.Content style={styles.content}>
          <Text variant="headlineMedium">
            {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: plan.currency, currencyDisplay: 'code' }).format(amount)}
          </Text>
          <Controller
            control={control}
            name="provider"
            render={({ field, fieldState }) => (
              <SelectField
                label="Moyen de paiement"
                value={field.value}
                onChange={(value) => field.onChange(value ?? 'orange_money')}
                error={fieldState.error?.message}
                options={[
                  { label: 'Orange Money', value: 'orange_money' },
                  { label: 'Autre Mobile Money', value: 'mobile_money' },
                ]}
              />
            )}
          />
          <FormField
            control={control}
            name="phoneNumber"
            label="Numéro Mobile Money"
            keyboardType="phone-pad"
            placeholder="+224..."
          />
          <Text>Le forfait sera activé uniquement après confirmation serveur du prestataire.</Text>
          {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
          <AppButton loading={mutation.isPending} onPress={handleSubmit((value) => mutation.mutate(value))}>
            Demander le paiement
          </AppButton>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { width: '92%', maxWidth: 560, alignSelf: 'center', marginTop: 24 },
  content: { gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
