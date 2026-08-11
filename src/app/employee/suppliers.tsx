import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScrollView } from 'react-native';
import { Card, Dialog, FAB, HelperText, Portal, Searchbar, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSuppliers, saveSupplier } from '@/features/products/api';
import { supplierSchema, type SupplierInput } from '@/schemas/catalog';
import type { Supplier } from '@/types/database';

export default function EmployeeSuppliers() {
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const canWrite = !!membership?.permissions.includes('suppliers.write');
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const query = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!company && !!store });
  const { control, handleSubmit, reset } = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema), defaultValues: { name: '', email: '', phone: '', address: '', isActive: true } });
  useEffect(() => {
    reset(editing ? { name: editing.name, email: editing.email ?? '', phone: editing.phone ?? '', address: editing.address ?? '', isActive: editing.is_active } : { name: '', email: '', phone: '', address: '', isActive: true });
  }, [editing, reset]);
  const show = (supplier?: Supplier) => { setEditing(supplier ?? null); setOpen(true); };
  const mutation = useMutation({ mutationFn: (value: SupplierInput) => saveSupplier(company, store, value, editing?.id), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['suppliers', company, store] }); setOpen(false); setEditing(null); reset(); } });
  const needle = search.trim().toLowerCase();
  const shown = (query.data ?? []).filter((item) => !needle || `${item.name} ${item.email ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(needle));
  return <PermissionGuard permission="suppliers.read"><AdminPage title="Fournisseurs" action={canWrite ? <FAB size="small" icon="plus" onPress={() => show()} /> : undefined}>
    <Searchbar placeholder="Nom, email ou téléphone" value={search} onChangeText={setSearch} />
    {shown.map((item) => <Card key={item.id} mode="contained" onPress={canWrite ? () => show(item) : undefined}><Card.Title title={item.name} subtitle={[item.email, item.phone].filter(Boolean).join(' • ') || 'Aucun contact'} right={() => <Text style={{ marginRight: 16 }}>{item.is_active ? 'Actif' : 'Archivé'}</Text>} /></Card>)}
    {!query.isLoading && !shown.length && <EmptyState icon="truck-outline" title="Aucun fournisseur" message="Aucun fournisseur ne correspond à votre recherche." />}
    {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
    <Portal><Dialog visible={open} onDismiss={() => setOpen(false)}><Dialog.Title>{editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><FormField control={control} name="name" label="Nom" /><FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" /><FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" /><FormField control={control} name="address" label="Adresse" multiline />{!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions><AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={mutation.isPending} onPress={handleSubmit((value) => mutation.mutate(value))}>{editing ? 'Enregistrer' : 'Ajouter'}</AppButton></Dialog.Actions></Dialog></Portal>
  </AdminPage></PermissionGuard>;
}
