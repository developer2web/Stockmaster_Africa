import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Card, HelperText, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { getCheckoutCustomers } from '@/features/customers/api';
import { matchesCustomer } from '@/features/sales/checkout';

export function SaleCustomerPicker({ companyId, value, onChange, required }: {
  companyId: string; value: string | null; onChange: (id: string | null) => void; required: boolean;
}) {
  const [search, setSearch] = useState('');
  // Une fois un client choisi, on replie la recherche et la liste : les
  // garder ouvertes juste en dessous du client déjà retenu donnait
  // l'impression que la sélection n'avait servi à rien (l'audit l'a
  // remonté comme "le sélecteur reste ouvert après sélection"). On ne les
  // rouvre que si l'utilisateur demande explicitement à changer de client.
  const [editing, setEditing] = useState(false);
  const customers = useQuery({ queryKey: ['checkout-customers', companyId], queryFn: () => getCheckoutCustomers(companyId), enabled: !!companyId });
  const selected = customers.data?.find(customer => customer.id === value);
  const matches = (customers.data ?? []).filter(customer => matchesCustomer(customer, search));
  if (value && !editing) return <View style={{ gap: 8 }}>
    <Text variant="titleMedium">{required ? 'Client à crédit (obligatoire)' : 'Client'}</Text>
    <Text accessibilityLiveRegion="polite">Client choisi : {selected?.name ?? '…'}{selected?.phone ? ` · ${selected.phone}` : ''}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <AppButton mode="text" onPress={() => { setSearch(''); setEditing(true); }}>Changer de client</AppButton>
      <AppButton mode="text" onPress={() => onChange(null)}>Retirer ce client</AppButton>
    </View>
  </View>;
  return <View style={{ gap: 8 }}>
    <Text variant="titleMedium">{required ? 'Client à crédit (obligatoire)' : 'Client'}</Text>
    <AppSearchBar placeholder="Nom ou téléphone du client" value={search} onChangeText={setSearch} />
    {customers.isLoading && <Text>Chargement des clients…</Text>}
    {!!customers.error && <><HelperText type="error" visible>Impossible de charger les clients. Votre sélection est conservée.</HelperText><AppButton mode="text" onPress={() => void customers.refetch()}>Réessayer</AppButton></>}
    {matches.slice(0, 8).map(customer => <Card key={customer.id} mode="outlined" accessibilityRole="button" accessibilityLabel={`${customer.name} ${customer.phone ?? ''}`} accessibilityState={{ selected: value === customer.id }} onPress={() => { onChange(customer.id); setEditing(false); }} style={value === customer.id ? { borderWidth: 2, borderColor: '#084B50' } : undefined}><Card.Content style={{ gap: 4 }}><Text style={{ fontWeight: value === customer.id ? '800' : '500' }}>{customer.name}</Text>{!!customer.phone && <Text>{customer.phone}</Text>}</Card.Content></Card>)}
    {matches.length > 8 && <Text>Précisez le nom ou le téléphone pour retrouver le client parmi {matches.length} résultats.</Text>}
    {!customers.isLoading && !customers.error && !matches.length && <Text>{search ? 'Aucun client trouvé. Vérifiez le nom ou le téléphone.' : 'Aucun client actif disponible. Ajoutez un client depuis Clients avant une vente à crédit.'}</Text>}
    {!!value && <AppButton mode="text" onPress={() => setEditing(false)}>Annuler</AppButton>}
  </View>;
}
