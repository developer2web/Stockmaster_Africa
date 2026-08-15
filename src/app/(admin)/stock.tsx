import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, HelperText, Icon, IconButton, Searchbar, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { getStockLevels, getStockMovements } from '@/features/inventory/api';
import { useStockRealtime } from '@/hooks/useStockRealtime';
import { useCurrency } from '@/features/currency/CurrencyProvider';

export default function StockScreen() {
  const { formatMoney: money } = useCurrency();
  const { membership } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [search, setSearch] = useState('');
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  useStockRealtime(company);
  const levels = useQuery({ queryKey: ['stock-levels', company, store], queryFn: () => getStockLevels(company, undefined, store), enabled: !!company && !!store });
  const movements = useQuery({ queryKey: ['stock-movements', company, store], queryFn: () => getStockMovements(company, undefined, store), enabled: !!company && !!store });
  const rows = levels.data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  const purchaseValue = rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.product?.purchase_price ?? 0), 0);
  const expectedRevenue = rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.product?.sale_price ?? 0), 0);
  const needle = search.trim().toLowerCase();
  const visible = rows.filter((row) => !needle
    || row.product?.name.toLowerCase().includes(needle)
    || row.product?.sku.toLowerCase().includes(needle)
    || row.store?.name.toLowerCase().includes(needle));

  return (
    <AdminPage
      title="Inventaire"
      action={<View style={{flexDirection:'row',alignItems:'center'}}><IconButton accessibilityLabel="Faire l’inventaire" icon="clipboard-list-outline" onPress={()=>router.push('/inventory-count' as never)}/><IconButton accessibilityLabel="Scanner un produit" icon="barcode-scan" onPress={() => router.push('/scanner' as never)} /></View>}
    >
      <View style={[styles.summary, compact && styles.compactSummary, { backgroundColor: theme.colors.primaryContainer }]}>
        <View style={[styles.summaryIcon, { backgroundColor: theme.colors.primary }]}>
          <Icon source="warehouse" size={30} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.metrics}>
          <Metric compact={compact} label="Produits référencés" value={String(new Set(rows.map((row) => row.product_id)).size)} />
          <Metric compact={compact} label="Quantité totale" value={total.toLocaleString('fr-FR')} />
          <Metric compact={compact} label="Valeur d’achat" value={money(purchaseValue)} />
          <Metric compact={compact} label="Valeur de vente du stock" value={money(expectedRevenue)} />
        </View>
      </View>

      <View style={styles.tools}>
        <Searchbar style={[styles.search, compact && styles.compactSearch]} placeholder="Produit, SKU ou boutique" value={search} onChangeText={setSearch} />
        <AppButton style={compact ? styles.fullWidth : undefined} icon="plus" onPress={() => router.push('/products/new' as never)}>
          Ajouter un produit
        </AppButton>
      </View>
      {!!levels.error && <HelperText type="error" visible>{levels.error.message}</HelperText>}

      {!compact && (
        <View style={[styles.tableHeader, { borderColor: theme.colors.outlineVariant }]}>
          <Text style={[styles.productColumn, styles.bold]}>Produit</Text>
          <Text style={[styles.storeColumn, styles.bold]}>Boutique</Text>
          <Text style={[styles.numberColumn, styles.bold]}>Quantité</Text>
          <Text style={[styles.numberColumn, styles.bold]}>Prix de vente</Text>
        </View>
      )}
      {visible.map((level) => (
        <Card key={level.id} mode="contained" onPress={() => router.push(`/products/${level.product_id}` as never)} style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={[styles.tableRow, compact && styles.compactTableRow]}>
            <View style={[styles.productColumn, compact && styles.compactProductColumn]}>
              <Text variant="titleSmall" style={styles.bold} numberOfLines={2}>{level.product?.name ?? 'Produit'}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>{level.variant?.sku ?? level.product?.sku}</Text>
            </View>
            <Text style={[styles.storeColumn, compact && styles.compactValue]} numberOfLines={2}>{compact ? `Boutique : ${level.store?.name ?? 'Boutique'}` : level.store?.name ?? 'Boutique'}</Text>
            <Text style={[styles.numberColumn, compact && styles.compactValue, styles.bold, { color: Number(level.quantity) <= 0 ? theme.colors.error : theme.colors.primary }]}>{compact ? `Quantité : ${Number(level.quantity).toLocaleString('fr-FR')}` : Number(level.quantity).toLocaleString('fr-FR')}</Text>
            <Text style={[styles.numberColumn, compact && styles.compactValue, styles.bold]}>{compact ? `Prix : ${money(Number(level.product?.sale_price ?? 0))}` : money(Number(level.product?.sale_price ?? 0))}</Text>
          </Card.Content>
        </Card>
      ))}
      {!levels.isLoading && !visible.length && <EmptyState icon="warehouse" title="Aucun stock trouvé" message="Scannez un produit, ajoutez-le ou modifiez votre recherche." />}

      <Text variant="titleLarge" style={styles.bold}>Derniers mouvements</Text>
      {(movements.data ?? []).slice(0, 12).map((movement) => {
        const positive = Number(movement.quantity) >= 0;
        return (
          <Card key={movement.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Content style={styles.movement}>
              <View style={[styles.movementIcon, { backgroundColor: positive ? theme.colors.primaryContainer : theme.colors.errorContainer }]}>
                <Icon source={positive ? 'arrow-down-left' : 'arrow-up-right'} size={22} color={positive ? theme.colors.primary : theme.colors.error} />
              </View>
              <View style={styles.grow}>
                <Text variant="titleSmall" style={styles.bold} numberOfLines={2}>{movement.product?.name ?? 'Produit'}</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>{movement.store?.name ?? 'Boutique'} · {new Date(movement.created_at).toLocaleString('fr-CA')}</Text>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.movementQuantity, styles.bold, { color: positive ? theme.colors.primary : theme.colors.error }]}>{positive ? '+' : ''}{Number(movement.quantity).toLocaleString('fr-FR')}</Text>
            </Card.Content>
          </Card>
        );
      })}
    </AdminPage>
  );
}

function Metric({ compact, label, value }: { compact: boolean; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, compact && styles.compactMetric]}>
      <Text style={{ color: theme.colors.onPrimaryContainer }}>{label}</Text>
      <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.bold}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: 20, borderRadius: 24 },
  compactSummary: { flexDirection: 'column', alignItems: 'stretch', padding: 16 },
  summaryIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  metrics: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metric: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  compactMetric: { flexBasis: '45%' },
  bold: { fontWeight: '800' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  search: { flex: 1, minWidth: 240 },
  compactSearch: { minWidth: 0, width: '100%' },
  fullWidth: { width: '100%' },
  tableHeader: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactTableRow: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  compactValue: { flex: 0, minWidth: 0, width: '100%', textAlign: 'left' },
  compactProductColumn: { flex: 0, minWidth: 0, width: '100%' },
  productColumn: { flex: 2, minWidth: 100 },
  storeColumn: { flex: 1.3, minWidth: 75 },
  numberColumn: { flex: 1, minWidth: 65, textAlign: 'right' },
  movement: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  movementIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  movementQuantity: { maxWidth: '24%', textAlign: 'right' },
  grow: { flex: 1, minWidth: 0 },
});
