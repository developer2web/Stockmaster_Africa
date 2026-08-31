import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { Card, Dialog, HelperText, Icon, Portal, Text, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { supportedCountries } from '@/constants/countries';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { createBusiness } from '@/features/workspace/api';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';

const schema = z.object({
  companyName: z.string().trim().min(2, 'Nom de l’entreprise requis').max(100),
  storeName: z.string().trim().min(2, 'Nom de la boutique requis').max(100),
  countryCode: z.string().length(2),
});
type Values = z.infer<typeof schema>;

const statusLabels: Record<string, string> = {
  active: 'Actif', trialing: 'Essai en cours', past_due: 'À renouveler', expired: 'Expiré',
  pending: 'En attente', suspended: 'Suspendu', canceled: 'Annulé', cancelled: 'Annulé',
};

export default function ChooseBusinessScreen() {
  const theme = useTheme();
  const { businesses, selectBusiness, refreshMembership, signOut } = useAuth();
  const { canUseFeature } = useSubscription();
  const [open, setOpen] = useState(false);
  const [openingPlans, setOpeningPlans] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: '', storeName: '', countryCode: 'GN' },
  });

  const create = useMutation({
    mutationFn: (values: Values) => createBusiness(values.companyName, values.storeName, values.countryCode),
    onSuccess: async (companyId) => {
      await refreshMembership();
      const availableStores = await selectBusiness(companyId);
      setOpen(false);
      router.replace(availableStores.length === 1 ? '/' : '/choose-store');
    },
  });

  const choose = async (companyId: string) => {
    const availableStores = await selectBusiness(companyId);
    router.replace(availableStores.length === 1 ? '/' : '/choose-store');
  };

  const openPlans = async () => {
    const billingBusiness = businesses.find((business) => business.role === 'company_admin');
    if (!billingBusiness || openingPlans) return;
    setOpeningPlans(true);
    setNavigationError('');
    try {
      await openAccountPortal(billingBusiness.companyId);
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : 'Impossible d’ouvrir les forfaits.');
    } finally {
      setOpeningPlans(false);
    }
  };

  const employeeOnly = businesses.length > 0 && businesses.every((business) => business.role === 'employee');
  const canCreateBusiness = businesses.length === 0 || canUseFeature('multi_business');
  if (employeeOnly) return <Redirect href="/" />;

  return (
    <AdminPage title="Vos entreprises" description="Choisissez l’espace de travail que vous souhaitez ouvrir.">
      <View style={styles.summaryRow}>
        <View style={[styles.summaryIcon, { backgroundColor: theme.colors.primaryContainer }]}>
          <Icon source="office-building-outline" size={24} color={theme.colors.onPrimaryContainer} />
        </View>
        <View style={styles.grow}>
          <Text variant="titleMedium" style={styles.bold}>
            {businesses.length} entreprise{businesses.length > 1 ? 's' : ''} accessible{businesses.length > 1 ? 's' : ''}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Les boutiques et les données de chaque entreprise restent séparées.
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {businesses.map((business) => {
          const label = statusLabels[business.subscriptionStatus ?? ''] ?? 'Sans abonnement';
          const attention = ['expired', 'suspended', 'past_due'].includes(business.subscriptionStatus ?? '');
          return (
            <Card
              key={business.companyId}
              mode="outlined"
              onPress={() => void choose(business.companyId)}
              style={styles.businessCard}
              accessibilityLabel={`Ouvrir ${business.companyName}`}
            >
              <Card.Content style={styles.businessRow}>
                <View style={[styles.businessIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                  <Text variant="titleLarge" style={[styles.initial, { color: theme.colors.onSecondaryContainer }]}>
                    {business.companyName.trim().charAt(0).toUpperCase() || 'E'}
                  </Text>
                </View>
                <View style={styles.grow}>
                  <Text variant="titleMedium" numberOfLines={1} style={styles.bold}>{business.companyName}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>{business.roleName}</Text>
                  <Text variant="labelMedium" style={{ color: attention ? theme.colors.error : theme.colors.primary, marginTop: 3 }}>
                    {label}
                  </Text>
                </View>
                <Icon source="chevron-right" size={26} color={theme.colors.onSurfaceVariant} />
              </Card.Content>
            </Card>
          );
        })}
      </View>

      {!businesses.length && (
        <EmptyState icon="office-building-plus" title="Aucune entreprise" message="Créez votre première entreprise pour commencer." />
      )}

      {canCreateBusiness ? (
        <AppButton icon="plus" onPress={() => { reset(); setOpen(true); }}>Ajouter une entreprise</AppButton>
      ) : (
        <Card mode="contained" style={[styles.upgradeCard, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Card.Content style={styles.upgradeContent}>
            <View style={[styles.summaryIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <Icon source="lock-outline" size={22} color={theme.colors.onPrimaryContainer} />
            </View>
            <View style={styles.grow}>
              <Text variant="titleMedium" style={styles.bold}>Plusieurs entreprises avec Business</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                Votre forfait actuel autorise une seule entreprise active.
              </Text>
            </View>
          </Card.Content>
          <Card.Actions style={styles.upgradeActions}>
            <AppButton icon="arrow-right" loading={openingPlans} onPress={() => void openPlans()}>Voir les forfaits</AppButton>
          </Card.Actions>
        </Card>
      )}

      {!!navigationError && <HelperText type="error" visible>{navigationError}</HelperText>}
      <AppButton mode="text" icon="logout" onPress={() => void signOut()}>Se déconnecter</AppButton>

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>Nouvelle entreprise</Dialog.Title>
          <Dialog.Content>
            <FormField control={control} name="companyName" label="Nom de l’entreprise" />
            <FormField control={control} name="storeName" label="Première boutique" />
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <SelectField
                  label="Pays d’activité"
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? 'GN')}
                  options={supportedCountries.map((country) => ({ label: `${country.name} — ${country.currency}`, value: country.code }))}
                />
              )}
            />
            {!!create.error && <HelperText type="error" visible>{create.error.message}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton>
            <AppButton loading={create.isPending} onPress={handleSubmit((values) => create.mutate(values))}>Créer</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '800' },
  list: { gap: 10 },
  businessCard: { borderRadius: 16 },
  businessRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 13 },
  businessIcon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '900' },
  upgradeCard: { borderRadius: 18 },
  upgradeContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  upgradeActions: { paddingHorizontal: 16, paddingBottom: 14, justifyContent: 'flex-end' },
  dialogActions: { flexWrap: 'wrap' },
});
