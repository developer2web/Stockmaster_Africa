import { usePermissions } from '@/features/auth/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Searchbar, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';

type SearchResult = { id: string; title: string; subtitle: string; kind: 'Produit' | 'Fournisseur' | 'Vente'; path: string };

// Équivalent de (admin)/search.tsx, limité à ce que les permissions de l'employé
// autorisent réellement à consulter — pas de client (aucune fiche client côté
// employé), et le fournisseur mène à la liste (pas de fiche détail dédiée ici).
async function searchEmployeeWorkspace(companyId: string, storeId: string, term: string, can: (permission: string) => boolean): Promise<SearchResult[]> {
  const pattern = `%${term}%`;
  const tasks: PromiseLike<SearchResult[]>[] = [];
  if (can('products.read')) tasks.push(
    supabase.from('products').select('id,name,sku,barcode').eq('company_id', companyId).eq('store_id', storeId).or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`).limit(12)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Produit · ${item.sku ?? item.barcode ?? 'Sans code'}`, kind: 'Produit' as const, path: `/employee/products/${item.id}` }));
      }),
  );
  if (can('suppliers.read')) tasks.push(
    supabase.from('suppliers').select('id,name,phone').eq('company_id', companyId).eq('store_id', storeId).or(`name.ilike.${pattern},phone.ilike.${pattern}`).limit(12)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Fournisseur · ${item.phone ?? 'Téléphone non renseigné'}`, kind: 'Fournisseur' as const, path: '/employee/suppliers' }));
      }),
  );
  if (can('sales.read')) tasks.push(
    supabase.from('sales').select('id,reference,total,created_at').eq('company_id', companyId).eq('store_id', storeId).ilike('reference', pattern).order('created_at', { ascending: false }).limit(12)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map((item) => ({ id: item.id, title: item.reference ?? 'Vente', subtitle: `Vente · ${Number(item.total).toLocaleString('fr-CA')} · ${new Date(item.created_at).toLocaleDateString('fr-FR')}`, kind: 'Vente' as const, path: `/employee/sales/${item.id}` }));
      }),
  );
  return (await Promise.all(tasks)).flat();
}

export default function EmployeeSearchScreen() {
  const theme = useTheme();
  const can = usePermissions();
  const { membership } = useAuth();
  const [term, setTerm] = useState('');
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const query = useQuery({
    queryKey: ['employee-global-search', companyId, storeId, term.trim()],
    queryFn: () => searchEmployeeWorkspace(companyId, storeId, term.trim(), can),
    enabled: !!companyId && !!storeId && term.trim().length >= 2,
  });
  return <AdminPage title="Recherche">
    <Searchbar placeholder="Produit, fournisseur ou référence…" value={term} onChangeText={setTerm} autoFocus />
    <Text style={{ color: theme.colors.onSurfaceVariant }}>Saisissez au moins 2 caractères. Les résultats restent limités à ce que vos permissions autorisent.</Text>
    {query.isLoading && <Text>Recherche en cours…</Text>}
    {query.error && <Text style={{ color: theme.colors.error }}>{query.error.message}</Text>}
    {term.trim().length >= 2 && !query.isLoading && !query.data?.length && <EmptyState icon="magnify-close" title="Aucun résultat" message="Essayez un nom, une référence ou un numéro de téléphone." />}
    <View style={{ gap: 10 }}>
      {query.data?.map((result) => <Card key={`${result.kind}-${result.id}`} mode="outlined" onPress={() => router.push(result.path as never)}>
        {/* Retour testeur du 25/09 : un Card.Content dans le `left` de Card.Title (repris de
            (admin)/search.tsx, même bug là-bas) s'affichait avec le texte empilé lettre par
            lettre à la verticale — une simple View suffit, sans le padding de Card.Content
            qui écrasait sa largeur disponible. */}
        <Card.Title title={result.title} subtitle={result.subtitle} left={() => <View style={styles.kind}><Text numberOfLines={1} style={{ color: theme.colors.primary, fontWeight: '800' }}>{result.kind}</Text></View>} />
      </Card>)}
    </View>
  </AdminPage>;
}

const styles = StyleSheet.create({ kind: { width: 76 } });
