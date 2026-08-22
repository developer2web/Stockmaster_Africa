import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Card, Dialog, HelperText, Portal, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { recordStockMovement } from '@/features/inventory/api';
import { stockMovementSchema, StockMovementInput } from '@/schemas/inventory';
import type { ProductVariant } from '@/types/database';
import { formatQuantity, parseDecimal } from '@/utils/number';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  companyId: string;
  storeId: string;
  storeName?: string | null;
  productId: string;
  currentQuantity: number;
  variants?: ProductVariant[];
  initialVariantId?: string | null;
  initialDirection?: 'in' | 'out';
};

export function StockAdjustmentDialog({
  visible,
  onDismiss,
  companyId,
  storeId,
  storeName,
  productId,
  currentQuantity,
  variants = [],
  initialVariantId = null,
  initialDirection = 'in',
}: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { control, handleSubmit, reset } = useForm<StockMovementInput>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      storeId,
      variantId: initialVariantId,
      direction: initialDirection,
      quantity: '1',
      note: '',
    },
  });
  const direction = useWatch({ control, name: 'direction' });
  const quantity = parseDecimal(useWatch({ control, name: 'quantity' })) || 0;
  const projectedQuantity = currentQuantity + (direction === 'out' ? -quantity : quantity);

  useEffect(() => {
    if (!visible) return;
    reset({
      storeId,
      variantId: initialVariantId,
      direction: initialDirection,
      quantity: '1',
      note: '',
    });
  }, [initialDirection, initialVariantId, reset, storeId, visible]);

  const save = useMutation({
    mutationFn: (values: StockMovementInput) => recordStockMovement(productId, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock-levels', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['stock-movements', companyId] }),
      ]);
      onDismiss();
    },
  });
  const variantOptions = [
    { label: 'Produit simple', value: null },
    ...variants
      .filter((variant) => variant.is_active)
      .map((variant) => ({ label: `${variant.name} • ${variant.sku}`, value: variant.id })),
  ];

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxWidth: 540, width: '92%', alignSelf: 'center' }}>
        <Dialog.Title>{initialDirection === 'in' ? 'Ajouter du stock' : 'Retirer du stock'}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0, maxHeight: 520 }}>
          <ScrollView
            contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
          <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
            <Card.Content>
              <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>
                Boutique active
              </Text>
              <Text variant="titleLarge" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '800' }}>
                {storeName || 'Boutique'}
              </Text>
              <Text style={{ color: theme.colors.onPrimaryContainer }}>
                Stock actuel : {formatQuantity(currentQuantity)} → Nouveau stock : {formatQuantity(projectedQuantity)}
              </Text>
            </Card.Content>
          </Card>
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <SegmentedButtons
                value={field.value}
                onValueChange={(value) => field.onChange(value as 'in' | 'out')}
                buttons={[
                  { value: 'in', label: 'Entrée', icon: 'plus-circle-outline' },
                  { value: 'out', label: 'Sortie', icon: 'minus-circle-outline' },
                ]}
              />
            )}
          />
          {!!variants.length && (
            <Controller
              control={control}
              name="variantId"
              render={({ field, fieldState }) => (
                <SelectField
                  label="Variante"
                  value={field.value}
                  options={variantOptions}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
          <FormField control={control} name="quantity" label="Quantité à déplacer" keyboardType="decimal-pad" />
          <FormField control={control} name="note" label="Motif obligatoire" multiline />
          {!!save.error && <HelperText type="error" visible>{save.error.message}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <AppButton mode="text" onPress={onDismiss}>Annuler</AppButton>
          <AppButton
            icon={direction === 'in' ? 'plus' : 'minus'}
            loading={save.isPending}
            disabled={!storeId || projectedQuantity < 0}
            onPress={handleSubmit((values) => save.mutate(values))}
          >
            {direction === 'in' ? 'Ajouter' : 'Retirer'}
          </AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
