import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Card, HelperText, Switch } from 'react-native-paper';
import { StyleSheet } from 'react-native';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { ResponsiveFormGrid } from '@/components/forms/ResponsiveFormGrid';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveCustomer } from '@/features/customers/api';
import { customerSchema, type CustomerInput } from '@/schemas/customers';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { readableError } from '@/utils/errors';

const defaults: CustomerInput = { name: '', phone: '', email: '', address: '', note: '', creditLimit: '', isActive: true };

export default function NewCustomer() {
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const {primaryCode}=useCurrency();
  const store = membership?.storeId ?? null;
  const queryClient = useQueryClient();
  const { control, handleSubmit,formState:{isValid,isDirty} } = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: defaults,mode:'onChange' });
  const save = useMutation({
    mutationFn: (value: CustomerInput) => saveCustomer(company, store, value),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['customers', company] });
      router.replace({pathname:`/customers/${id}` as never,params:{notice:'Client enregistré'}});
    },
  });

  return (
    <AdminPage title="Nouveau client">
      <Card mode="outlined" style={styles.form}><Card.Title title="Identité du client" subtitle="Les champs marqués * sont obligatoires"/><Card.Content style={styles.content}><FormField control={control} name="name" label="Nom du client" required autoFocus />
      <ResponsiveFormGrid><FormField control={control} name="phone" label="Téléphone (facultatif)" keyboardType="phone-pad" />
      <FormField control={control} name="email" label="Email (facultatif)" autoCapitalize="none" keyboardType="email-address" /></ResponsiveFormGrid>
      <ResponsiveFormGrid><FormField control={control} name="address" label="Adresse (facultative)" />
      <FormField control={control} name="creditLimit" label={`Limite de crédit (${primaryCode}, facultative)`} keyboardType="decimal-pad" /></ResponsiveFormGrid>
      <FormField control={control} name="note" label="Note (facultative)" multiline />
      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <Card mode="outlined"><Card.Title title="Client actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>
        )}
      />
      {!!save.error && <HelperText type="error" visible>{readableError(save.error)}</HelperText>}
      <AppButton icon="content-save" testID="customer-save-button" loading={save.isPending} disabled={!isValid||!isDirty} onPress={handleSubmit((value) => save.mutate(value))}>
        Enregistrer le client
      </AppButton></Card.Content></Card>
    </AdminPage>
  );
}

const styles=StyleSheet.create({form:{width:'100%',maxWidth:720,alignSelf:'center'},content:{gap:8}});
