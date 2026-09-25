import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Searchbar, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';

type SearchResult = { id: string; title: string; subtitle: string; kind: 'Produit' | 'Client' | 'Fournisseur' | 'Vente'; path: string };

async function searchWorkspace(companyId: string, storeId: string, term: string): Promise<SearchResult[]> {
  const pattern = `%${term}%`;
  const [products, customers, suppliers, sales] = await Promise.all([
    supabase.from('products').select('id,name,sku,barcode').eq('company_id', companyId).eq('store_id', storeId).or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`).limit(12),
    supabase.from('customers').select('id,name,phone').eq('company_id', companyId).or(`name.ilike.${pattern},phone.ilike.${pattern}`).limit(12),
    supabase.from('suppliers').select('id,name,phone').eq('company_id', companyId).eq('store_id', storeId).or(`name.ilike.${pattern},phone.ilike.${pattern}`).limit(12),
    supabase.from('sales').select('id,reference,total,created_at').eq('company_id', companyId).eq('store_id', storeId).ilike('reference', pattern).order('created_at', { ascending: false }).limit(12),
  ]);
  const error = products.error ?? customers.error ?? suppliers.error ?? sales.error;
  if (error) throw new Error(error.message);
  return [
    ...(products.data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Produit · ${item.sku ?? item.barcode ?? 'Sans code'}`, kind: 'Produit' as const, path: `/products/${item.id}` })),
    ...(customers.data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Client · ${item.phone ?? 'Téléphone non renseigné'}`, kind: 'Client' as const, path: `/customers/${item.id}` })),
    ...(suppliers.data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Fournisseur · ${item.phone ?? 'Téléphone non renseigné'}`, kind: 'Fournisseur' as const, path: `/suppliers/${item.id}` })),
    // fr-CA pour le montant (séparateur de milliers toujours visible,
    // contrairement à l'espace fine insécable de fr-FR) ; fr-FR reste correct
    // pour la date, seul le formatage des nombres est concerné.
    ...(sales.data ?? []).map((item) => ({ id: item.id, title: item.reference ?? 'Vente', subtitle: `Vente · ${Number(item.total).toLocaleString('fr-CA')} · ${new Date(item.created_at).toLocaleDateString('fr-FR')}`, kind: 'Vente' as const, path: `/sales/${item.id}` })),
  ];
}

export default function GlobalSearchScreen() {
  const theme = useTheme();
  const { membership } = useAuth();
  const [term, setTerm] = useState('');
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const query = useQuery({ queryKey: ['global-search', companyId, storeId, term.trim()], queryFn: () => searchWorkspace(companyId, storeId, term.trim()), enabled: !!companyId && !!storeId && term.trim().length >= 2 });
  // Retour testeur du 25/09 : un Card.Content dans le `left` de Card.Title s'affichait avec
  // le texte empilé lettre par lettre à la verticale — une simple View suffit.
  return <AdminPage title="Recherche globale" backToHome><Searchbar placeholder="Produit, client, fournisseur ou référence…" value={term} onChangeText={setTerm} autoFocus /><Text style={{ color: theme.colors.onSurfaceVariant }}>Saisissez au moins 2 caractères. Les résultats restent limités à votre entreprise et votre boutique.</Text>{query.isLoading && <Text>Recherche en cours…</Text>}{query.error && <Text style={{ color: theme.colors.error }}>{query.error.message}</Text>}{term.trim().length >= 2 && !query.isLoading && !query.data?.length && <EmptyState icon="magnify-close" title="Aucun résultat" message="Essayez un nom, une référence ou un numéro de téléphone."/>}<View style={{ gap: 10 }}>{query.data?.map((result) => <Card key={`${result.kind}-${result.id}`} mode="outlined" onPress={() => router.push(result.path as never)}><Card.Title title={result.title} subtitle={result.subtitle} left={() => <View style={styles.kind}><Text numberOfLines={1} style={{ color: theme.colors.primary, fontWeight: '800' }}>{result.kind}</Text></View>} /></Card>)}</View></AdminPage>;
}

const styles = StyleSheet.create({ kind: { width: 76 } });
