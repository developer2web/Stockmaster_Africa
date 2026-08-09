import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Card, HelperText, Switch } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveCustomer } from '@/features/customers/api';
import { customerSchema, type CustomerInput } from '@/schemas/customers';

const defaults: CustomerInput = { name: '', phone: '', email: '', address: '', note: '', isActive: true };

export default function NewCustomer() {
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? null;
  const queryClient = useQueryClient();
  const { control, handleSubmit } = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: defaults });
  const save = useMutation({
    mutationFn: (value: CustomerInput) => saveCustomer(company, store, value),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['customers', company] });
      router.replace(`/customers/${id}` as never);
    },
  });

  return (
    <AdminPage title="Nouveau client">
      <FormField control={control} name="name" label="Nom du client" />
      <FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" />
      <FormField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" />
      <FormField control={control} name="address" label="Adresse" />
      <FormField control={control} name="note" label="Note" multiline />
      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <Card mode="outlined"><Card.Title title="Client actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>
        )}
      />
      {!!save.error && <HelperText type="error" visible>{save.error.message}</HelperText>}
      <AppButton testID="customer-save-button" loading={save.isPending} disabled={save.isPending} onPress={handleSubmit((value) => save.mutate(value))}>
        Enregistrer le client
      </AppButton>
    </AdminPage>
  );
}
