import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Chip, Icon, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';

type DemoProduct = { id: string; name: string; price: number; icon: string; stock: number };

const products: DemoProduct[] = [
  { id: 'riz', name: 'Riz 5kg', price: 40000, icon: 'rice', stock: 34 },
  { id: 'huile', name: 'Huile 1L', price: 15000, icon: 'bottle-soda-outline', stock: 6 },
  { id: 'sucre', name: 'Sucre 1kg', price: 8000, icon: 'cube-outline', stock: 52 },
  { id: 'savon', name: 'Savon', price: 3000, icon: 'shower', stock: 18 },
];

const stats = [
  ['Ventes du jour', '2 006 000 GNF', 'trending-up'],
  ['Produits actifs', '1 284', 'package-variant'],
  ['Stock faible', '12', 'alert-outline'],
  ['Solde de caisse', '4 850 000 GNF', 'cash-register'],
] as const;

const stockRows = [
  { name: 'Riz 5kg', qty: 34, low: false },
  { name: 'Huile 1L', qty: 6, low: true },
  { name: 'Sucre 1kg', qty: 52, low: false },
  { name: 'Savon', qty: 3, low: true },
];

const cashOpeningBalance = 175000;
const cashMovements = [
  { label: 'Vente SM-DEMO-0042', amount: 40000, positive: true },
  { label: 'Approvisionnement fournisseur', amount: -120000, positive: false },
  { label: 'Paiement client (crédit)', amount: 15000, positive: true },
];
const cashBalance = cashOpeningBalance + cashMovements.reduce((sum, m) => sum + m.amount, 0);

// fr-CA (not fr-FR) matches CurrencyProvider's real formatter: its thousands
// separator renders correctly in this stack, fr-FR's does not.
const money = (value: number) => `${value.toLocaleString('fr-CA')} GNF`;

const steps = ['Tableau de bord', 'Nouvelle vente', 'Stock', 'Caisse'] as const;

export default function DemoScreen() {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [justSold, setJustSold] = useState(false);

  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ product: products.find((p) => p.id === id)!, qty })),
    [cart],
  );
  const cartTotal = cartLines.reduce((sum, line) => sum + line.qty * line.product.price, 0);

  const addToCart = (id: string) => { setJustSold(false); setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })); };
  const clearCart = () => setCart({});
  const validateSale = () => { setCart({}); setJustSold(true); };

  const last = step === steps.length - 1;

  return (
    // Cet écran n'est pas enveloppé dans AuthScreen (contrairement aux
    // autres écrans d'authentification) et ne posait donc jamais le fond du
    // thème actif — sans ça, un texte devenu correctement clair en thème
    // sombre (theme.colors.primary) se serait retrouvé sur un fond resté
    // clair par défaut, tout aussi peu lisible que le bug d'origine.
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>StockMaster en action</Text>
        <Text style={styles.subtitle}>Explorez un aperçu interactif sans créer de compte. Les données sont fictives et rien n’est enregistré.</Text>
        <AppButton mode="outlined" icon="arrow-left" onPress={() => router.back()}>Retour</AppButton>
      </View>

      <View style={styles.stepper}>
        <Text style={[styles.stepLabel, { color: theme.colors.primary }]}>Étape {step + 1} sur {steps.length} · {steps[step]}</Text>
        <View style={styles.dots}>
          {steps.map((label, index) => (
            <View key={label} style={[styles.dot, { backgroundColor: index === step ? theme.colors.primary : theme.colors.outlineVariant }]} />
          ))}
        </View>
      </View>

      {step === 0 && (
        <>
          <View style={styles.grid}>
            {stats.map(([label, value, icon]) => (
              <Card key={label} mode="outlined" style={styles.stat}>
                <Card.Content>
                  <Icon source={icon} size={28} color="#084B50" />
                  <Text style={styles.label}>{label}</Text>
                  <Text variant="titleLarge" style={styles.value}>{value}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
          <Card mode="contained">
            <Card.Title title="Activité récente" subtitle="Une vue simple pour décider rapidement" />
            <Card.Content style={styles.list}>
              {['Vente #4821 · 325 000 GNF', 'Paiement reçu · 180 000 GNF', 'Stock faible · 12 produits', 'Caisse ouverte · Boutique principale'].map((item) => (
                <View key={item} style={styles.row}><Chip icon="check">Aujourd’hui</Chip><Text style={styles.rowText}>{item}</Text></View>
              ))}
            </Card.Content>
          </Card>
        </>
      )}

      {step === 1 && (
        <>
          <Text style={styles.stepIntro}>Touchez un produit pour l’ajouter au panier, comme dans une vraie vente.</Text>
          <View style={styles.grid}>
            {products.map((product) => (
              <Card key={product.id} mode="outlined" style={styles.stat} onPress={() => addToCart(product.id)}>
                <Card.Content style={styles.productContent}>
                  <Icon source={product.icon} size={30} color="#084B50" />
                  <Text style={styles.label} numberOfLines={1}>{product.name}</Text>
                  <Text variant="titleMedium" style={styles.value}>{money(product.price)}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
          <Card mode="contained">
            <Card.Title title={`Panier (${cartLines.reduce((n, l) => n + l.qty, 0)})`} right={() => cartLines.length > 0 ? <AppButton mode="text" onPress={clearCart}>Vider</AppButton> : null} />
            <Card.Content style={styles.list}>
              {cartLines.length === 0 && !justSold && <Text style={styles.muted}>Panier vide. Touchez un produit ci-dessus.</Text>}
              {justSold && <View style={styles.successBanner}><Icon source="check-circle" size={22} color="#0B7A4B" /><Text style={styles.successText}>Vente simulée · Aucun reçu réel n’a été envoyé.</Text></View>}
              {cartLines.map((line) => (
                <View key={line.product.id} style={styles.row}>
                  <Text style={styles.rowText}>{line.qty} × {line.product.name}</Text>
                  <Text style={styles.bold}>{money(line.qty * line.product.price)}</Text>
                </View>
              ))}
              {cartLines.length > 0 && (
                <>
                  <View style={[styles.row, styles.totalRow]}><Text variant="titleMedium" style={styles.bold}>Total</Text><Text variant="titleMedium" style={styles.bold}>{money(cartTotal)}</Text></View>
                  <AppButton icon="cash-register" onPress={validateSale}>Valider la vente</AppButton>
                </>
              )}
            </Card.Content>
          </Card>
        </>
      )}

      {step === 2 && (
        <Card mode="contained">
          <Card.Title title="Stock actuel" subtitle="Boutique principale" />
          <Card.Content style={styles.list}>
            {stockRows.map((row) => (
              <View key={row.name} style={styles.row}>
                <Text style={styles.rowText}>{row.name}</Text>
                <Chip icon={row.low ? 'alert-outline' : 'check'} style={row.low ? styles.lowChip : undefined} textStyle={row.low ? styles.lowChipText : undefined}>
                  {row.qty} en stock
                </Chip>
              </View>
            ))}
            <Text style={styles.muted}>Une alerte automatique se déclenche dès qu’un produit passe sous son seuil.</Text>
          </Card.Content>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
            <Card.Content>
              <Text style={[styles.label, { color: theme.colors.onPrimaryContainer }]}>Solde de caisse</Text>
              <Text variant="headlineSmall" style={[styles.value, { color: theme.colors.onPrimaryContainer }]}>{money(cashBalance)}</Text>
            </Card.Content>
          </Card>
          <Card mode="contained">
            <Card.Title title="Mouvements du jour" />
            <Card.Content style={styles.list}>
              {cashMovements.map((movement) => (
                <View key={movement.label} style={styles.row}>
                  <Text style={styles.rowText}>{movement.label}</Text>
                  <Text style={[styles.bold, { color: movement.positive ? '#0B7A4B' : '#B3261E' }]}>{movement.positive ? '+' : ''}{money(movement.amount)}</Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        </>
      )}

      <View style={styles.nav}>
        <AppButton mode="outlined" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))}>Précédent</AppButton>
        {last
          ? <AppButton icon="account-plus" onPress={() => router.push('/(auth)/register')}>Créer mon espace</AppButton>
          : <AppButton icon="arrow-right" onPress={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>Suivant</AppButton>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  header: { gap: 10 },
  // Couleur posée en ligne (theme.colors.primary/onPrimaryContainer) plutôt
  // qu'ici : #084B50 en dur devenait illisible en thème sombre, où c'est
  // justement la couleur de fond de primaryContainer (audit externe, SM-03).
  title: { fontWeight: '900' },
  subtitle: { lineHeight: 22 },
  stepper: { gap: 8 },
  stepLabel: { fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 28, height: 5, borderRadius: 3 },
  stepIntro: { color: '#5C6E6B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  productContent: { gap: 2 },
  label: { marginTop: 12 },
  value: { fontWeight: '800', marginTop: 4 },
  list: { gap: 12 },
  row: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowText: { flexGrow: 1, flexBasis: 180, minWidth: 0 },
  bold: { fontWeight: '800' },
  muted: { color: '#8A9895', fontStyle: 'italic' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E1E9E7', paddingTop: 10 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#E5F5EC' },
  successText: { color: '#0B7A4B', fontWeight: '700', flexShrink: 1 },
  lowChip: { backgroundColor: '#FCE8E6' },
  lowChipText: { color: '#B3261E' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
});
