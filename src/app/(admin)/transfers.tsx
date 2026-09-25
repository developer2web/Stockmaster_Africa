import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import { Card, HelperText, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { SelectField } from '@/components/forms/SelectField';
import { useAuth } from '@/features/auth/AuthProvider';
import { getStockLevels } from '@/features/inventory/api';
import { transferStock } from '@/features/operations/api';
import { wholeOrNaN, formatQuantity } from '@/utils/number';
import { WholeNumberInput } from '@/components/forms/WholeNumberInput';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

export default function TransfersScreen() {
  const theme = useTheme();
  const { membership, stores } = useAuth();
  const qc = useQueryClient();
  const company = membership?.companyId ?? '';
  const source = membership?.storeId ?? '';
  const levels = useQuery({ queryKey: ['stock-levels', company, source], queryFn: () => getStockLevels(company, undefined, source), enabled: !!source });
  const [productId, setProductId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const selected = levels.data?.find(item => item.product_id === productId && !item.product_variant_id);
  const targetStoreName = stores.find(item => item.storeId === target)?.storeName;
  const parsedQuantity = wholeOrNaN(quantity);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= Number(selected?.quantity ?? 0);
  const mutation = useMutation({
    mutationFn: () => transferStock(source, target!, productId!, wholeOrNaN(quantity)),
    onSuccess: async () => {
      setProductId(null);
      setTarget(null);
      setQuantity('1');
      await qc.invalidateQueries({ queryKey: ['stock-levels', company] });
      router.replace('/stock' as never);
    },
  });

  return (
    <FeatureGate feature="transfers" label="Transferts entre boutiques">
      <AdminPage title="Transférer du stock" description={stores.length > 1 ? `Entre deux boutiques ${membership?.companyName ?? ''}` : 'Entre boutiques'}>
        <Card mode="contained"><Card.Title title="Boutique source" subtitle={membership?.storeName ?? 'Boutique active'} /></Card>
        <SelectField label="Boutique destination" value={target} onChange={setTarget} options={stores.filter(item => item.storeId !== source).map(item => ({ label: item.storeName, value: item.storeId }))} />
        <SelectField label="Produit" value={productId} onChange={setProductId} options={(levels.data ?? []).filter(item => !item.product_variant_id && Number(item.quantity) > 0 && item.product?.is_active !== false).map(item => ({ label: `${item.product?.name ?? 'Produit'} - stock ${formatQuantity(item.quantity)}`, value: item.product_id }))} />
        <WholeNumberInput label="Quantité à transférer" value={quantity} onChangeText={setQuantity} />
        {selected && <HelperText type="info" visible>Disponible : {formatQuantity(selected.quantity)}</HelperText>}
        {!!selected && !!targetStoreName && validQuantity && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.secondaryContainer }}>
            <Card.Content>
              <Text variant="labelLarge" style={{ color: theme.colors.onSecondaryContainer }}>Récapitulatif</Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSecondaryContainer, fontWeight: '800' }}>
                {formatQuantity(selected.quantity)} → {formatQuantity(Number(selected.quantity) - parsedQuantity)} pièces à {targetStoreName}
              </Text>
            </Card.Content>
          </Card>
        )}
        {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
        <AppButton icon="swap-horizontal" loading={mutation.isPending} disabled={!target || !productId || !validQuantity} onPress={() => mutation.mutate()}>
          Confirmer le transfert
        </AppButton>
      </AdminPage>
    </FeatureGate>
  );
}
