import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Card, Dialog, FAB, HelperText, Icon, Portal, Text } from 'react-native-paper';
import { z } from 'zod';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { createBusiness } from '@/features/workspace/api';
import { SelectField } from '@/components/forms/SelectField';
import { supportedCountries } from '@/constants/countries';

const schema = z.object({
  companyName: z.string().trim().min(2, 'Nom de l’entreprise requis').max(100),
  storeName: z.string().trim().min(2, 'Nom de la boutique requis').max(100),
  countryCode: z.string().length(2),
});
type Values = z.infer<typeof schema>;

export default function ChooseBusinessScreen() {
  const { businesses, selectBusiness, refreshMembership, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: '', storeName: '', countryCode: 'GN' },
  });
  const create = useMutation({
    mutationFn: (values: Values) => createBusiness(values.companyName, values.storeName, values.countryCode),
    onSuccess: async (companyId) => {
      await refreshMembership();
      await selectBusiness(companyId);
      setOpen(false);
      router.replace('/choose-store');
    },
  });
  const choose = async (companyId: string) => {
    await selectBusiness(companyId);
    router.replace('/choose-store');
  };
  const employeeOnly = businesses.length > 0 && businesses.every((business) => business.role === 'employee');
  if (employeeOnly) return <Redirect href="/" />;

  return <AdminPage title="Choisir une entreprise" action={<FAB size="small" icon="plus" onPress={() => { reset(); setOpen(true); }} />}>
    <Text variant="bodyLarge">Chaque entreprise possède ses propres boutiques et ses données restent entièrement séparées.</Text>
    {businesses.map((business) => <Card key={business.companyId} mode="contained" onPress={() => void choose(business.companyId)}>
      <Card.Title title={business.companyName} subtitle={`${business.roleName} • ${business.subscriptionStatus ?? 'sans abonnement'}`} left={() => <Icon source="office-building" size={30} />} />
    </Card>)}
    {!businesses.length && <EmptyState icon="office-building-plus" title="Aucune entreprise" message="Créez votre première entreprise pour commencer." />}
    <AppButton mode="text" icon="logout" onPress={() => void signOut()}>Se déconnecter</AppButton>
    <Portal><Dialog visible={open} onDismiss={() => setOpen(false)}>
      <Dialog.Title>Nouvelle entreprise</Dialog.Title>
      <Dialog.Content>
        <FormField control={control} name="companyName" label="Nom de l’entreprise" />
        <FormField control={control} name="storeName" label="Première boutique" />
        <Controller control={control} name="countryCode" render={({field})=><SelectField label="Pays d’activité" value={field.value} onChange={(value)=>field.onChange(value??'GN')} options={supportedCountries.map((country)=>({label:`${country.name} — ${country.currency}`,value:country.code}))}/>} />
        {!!create.error && <HelperText type="error" visible>{create.error.message}</HelperText>}
      </Dialog.Content>
      <Dialog.Actions><AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={create.isPending} onPress={handleSubmit((values) => create.mutate(values))}>Créer</AppButton></Dialog.Actions>
    </Dialog></Portal>
  </AdminPage>;
}
