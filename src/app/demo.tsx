import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { demoPalette, ProductArt, ShopShelfScene, WeekChart, type DemoProductKind } from '@/features/demo/DemoArt';

// Démo publique (sans compte) : tout est fictif et local à cet écran. Refonte du 26/09 :
// produits illustrés, graphique de la semaine, et une démo cohérente de bout en bout —
// une vente simulée fait baisser le stock et apparaît dans la caisse, comme dans l'app.

type DemoProduct = { id: DemoProductKind; name: string; price: number; stock: number; threshold: number; capacity: number };

const catalog: DemoProduct[] = [
  { id: 'riz', name: 'Riz 5 kg', price: 40000, stock: 34, threshold: 10, capacity: 60 },
  { id: 'huile', name: 'Huile 1 L', price: 15000, stock: 6, threshold: 8, capacity: 40 },
  { id: 'sucre', name: 'Sucre 1 kg', price: 8000, stock: 52, threshold: 12, capacity: 80 },
  { id: 'lait', name: 'Lait en poudre', price: 22000, stock: 14, threshold: 6, capacity: 30 },
  { id: 'tomate', name: 'Concentré de tomate', price: 5000, stock: 3, threshold: 10, capacity: 50 },
  { id: 'savon', name: 'Savon', price: 3000, stock: 18, threshold: 8, capacity: 40 },
];

const week = { labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Auj.'], values: [1250000, 980000, 1420000, 1180000, 1650000, 1890000, 2006000] };
const openingBalance = 175000;
type Movement = { id: string; label: string; detail: string; amount: number; icon: string };
const initialMovements: Movement[] = [
  { id: 'm1', label: 'Ouverture de caisse', detail: '08:02 · Aminata', amount: openingBalance, icon: 'lock-open-variant-outline' },
  { id: 'm2', label: 'Vente SM-DEMO-0041', detail: '09:15 · 2 articles', amount: 40000, icon: 'cart-check' },
  { id: 'm3', label: 'Approvisionnement fournisseur', detail: '10:40 · Huile 1 L × 12', amount: -120000, icon: 'truck-delivery-outline' },
  { id: 'm4', label: 'Paiement d’un crédit client', detail: '11:05 · Mamadou B.', amount: 15000, icon: 'account-cash-outline' },
];

// fr-CA (pas fr-FR) : même séparateur de milliers que CurrencyProvider, lisible partout.
const money = (value: number) => `${value.toLocaleString('fr-CA')} GNF`;
const steps = ['Tableau de bord', 'Vente', 'Stock', 'Caisse'] as const;

export default function DemoScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [step, setStep] = useState(0);
  const [stock, setStock] = useState<Record<string, number>>(() => Object.fromEntries(catalog.map(p => [p.id, p.stock])));
  const [cart, setCart] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<Movement[]>(initialMovements);
  const [lastSale, setLastSale] = useState<{ reference: string; total: number } | null>(null);
  const [saleCount, setSaleCount] = useState(42);

  const cartLines = useMemo(() => catalog.filter(p => (cart[p.id] ?? 0) > 0).map(product => ({ product, qty: cart[product.id] })), [cart]);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.qty * line.product.price, 0);
  const cartCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const balance = movements.reduce((sum, m) => sum + m.amount, 0);
  const todaySales = week.values[week.values.length - 1] + movements.filter(m => m.id.startsWith('sale-')).reduce((sum, m) => sum + m.amount, 0);
  const lowCount = catalog.filter(p => stock[p.id] <= p.threshold).length;

  const add = (product: DemoProduct) => {
    setLastSale(null);
    setCart(current => ((current[product.id] ?? 0) >= stock[product.id] ? current : { ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  };
  const removeOne = (id: string) => setCart(current => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }));
  const validate = () => {
    const reference = `SM-DEMO-00${saleCount}`;
    setStock(current => { const next = { ...current }; for (const line of cartLines) next[line.product.id] -= line.qty; return next; });
    setMovements(current => [...current, { id: `sale-${saleCount}`, label: `Vente ${reference}`, detail: `À l’instant · ${cartCount} article${cartCount > 1 ? 's' : ''}`, amount: cartTotal, icon: 'cart-check' }]);
    setLastSale({ reference, total: cartTotal });
    setSaleCount(n => n + 1);
    setCart({});
  };

  const surface = theme.colors.surface;
  const muted = theme.colors.onSurfaceVariant;
  const last = step === steps.length - 1;

  return (
    // Fond du thème actif posé ici : cet écran n'utilise pas AuthScreen (voir audit SM-03).
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.page}>
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
          <Text variant="displaySmall" style={[styles.heroTitle, { color: theme.colors.onBackground }]}>Votre boutique, du rayon à la caisse</Text>
          <Text variant="bodyLarge" style={{ color: muted, lineHeight: 24 }}>Vendez, suivez votre stock et comptez votre caisse au même endroit. Essayez librement : les données sont fictives et rien n’est enregistré.</Text>
          <View style={styles.heroActions}>
            <AppButton icon="play" onPress={() => setStep(1)}>Essayer une vente</AppButton>
            <AppButton mode="outlined" icon="arrow-left" onPress={() => router.back()}>Retour</AppButton>
          </View>
        </View>
        <View style={[styles.scene, wide && styles.sceneWide]}><ShopShelfScene /></View>
      </View>

      {/* Les 4 étapes forment une vraie séquence : numérotées, et cliquables pour y revenir. */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {steps.map((label, index) => {
          const active = index === step;
          return <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setStep(index)} style={({ pressed }) => [styles.tab, { backgroundColor: active ? demoPalette.brand : surface, borderColor: active ? demoPalette.brand : theme.colors.outlineVariant }, pressed && styles.pressed]}>
            <View style={[styles.tabNumber, { backgroundColor: active ? demoPalette.ochre : theme.colors.surfaceVariant }]}><Text style={[styles.tabNumberText, { color: active ? demoPalette.ink : muted }]}>{index + 1}</Text></View>
            <Text style={[styles.tabLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{label}</Text>
            {index === 1 && cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View>}
          </Pressable>;
        })}
      </View>

      {step === 0 && <View style={styles.stack}>
        <View style={styles.kpis}>
          {[
            { label: 'Ventes du jour', value: money(todaySales), icon: 'trending-up', tint: demoPalette.leaf },
            { label: 'Solde de caisse', value: money(balance), icon: 'wallet-outline', tint: demoPalette.brand },
            { label: 'Stock faible', value: `${lowCount} produit${lowCount > 1 ? 's' : ''}`, icon: 'alert-outline', tint: demoPalette.tomato },
          ].map(kpi => <View key={kpi.label} style={[styles.kpi, { backgroundColor: surface }]}>
            <View style={[styles.kpiIcon, { backgroundColor: `${kpi.tint}1F` }]}><Icon source={kpi.icon} size={22} color={kpi.tint} /></View>
            <Text style={{ color: muted }}>{kpi.label}</Text>
            <Text variant="titleLarge" numberOfLines={1} style={[styles.bold, { color: theme.colors.onSurface, fontSize: 20 }]}>{kpi.value}</Text>
          </View>)}
        </View>
        <View style={[styles.panel, { backgroundColor: surface }]}>
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Recettes des 7 derniers jours</Text>
          <Text style={{ color: muted }}>Meilleure journée de la semaine, avec {money(todaySales)} encaissés.</Text>
          <WeekChart values={[...week.values.slice(0, -1), todaySales]} labels={week.labels} height={wide ? 190 : 160} />
        </View>
        <View style={[styles.panel, { backgroundColor: surface }]}>
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Les plus vendus aujourd’hui</Text>
          {catalog.slice(0, 3).map((product, index) => <View key={product.id} style={styles.bestRow}>
            <ProductArt kind={product.id} size={44} />
            <View style={styles.grow}><Text style={[styles.bold, { color: theme.colors.onSurface }]}>{product.name}</Text><Text style={{ color: muted }}>{[18, 11, 9][index]} vendus</Text></View>
            <Text style={[styles.bold, { color: theme.colors.onSurface }]}>{money(product.price * [18, 11, 9][index])}</Text>
          </View>)}
        </View>
      </View>}

      {step === 1 && <View style={[styles.saleLayout, wide && styles.saleLayoutWide]}>
        <View style={[styles.grow, styles.stack]}>
          <Text style={{ color: muted }}>Touchez un produit pour l’ajouter au panier, comme au comptoir.</Text>
          <View style={styles.products}>
            {catalog.map(product => {
              const left = stock[product.id] - (cart[product.id] ?? 0);
              return <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Ajouter ${product.name}, ${money(product.price)}`} disabled={left <= 0} onPress={() => add(product)} style={({ pressed }) => [styles.productTile, pressed && styles.pressed, left <= 0 && styles.disabled]}>
                <View style={styles.productArt}><ProductArt kind={product.id} size={wide ? 84 : 72} /></View>
                <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
                <Text style={styles.productPrice}>{money(product.price)}</Text>
                <Text style={[styles.productStock, left <= product.threshold && { color: demoPalette.tomato }]}>{left > 0 ? `${left} en stock` : 'Rupture'}</Text>
                {(cart[product.id] ?? 0) > 0 && <View style={styles.tileBadge}><Text style={styles.badgeText}>{cart[product.id]}</Text></View>}
              </Pressable>;
            })}
          </View>
        </View>
        <View style={[styles.cart, { backgroundColor: surface, borderColor: theme.colors.outlineVariant }, wide && styles.cartWide]}>
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Panier{cartCount ? ` (${cartCount})` : ''}</Text>
          {lastSale && <View style={styles.success}>
            <Icon source="check-circle" size={22} color={demoPalette.leaf} />
            <View style={styles.grow}>
              <Text style={styles.successText}>Vente simulée · Aucun reçu réel n’a été envoyé.</Text>
              <Text style={styles.successDetail}>{lastSale.reference} · {money(lastSale.total)} — le stock et la caisse ont été mis à jour.</Text>
            </View>
          </View>}
          {!cartLines.length && !lastSale && <Text style={{ color: muted }}>Le panier est vide. Choisissez un produit.</Text>}
          {cartLines.map(line => <View key={line.product.id} style={styles.cartLine}>
            <ProductArt kind={line.product.id} size={36} />
            <View style={styles.grow}><Text style={{ color: theme.colors.onSurface }} numberOfLines={1}>{line.product.name}</Text><Text style={{ color: muted }}>{line.qty} × {money(line.product.price)}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Retirer un ${line.product.name}`} onPress={() => removeOne(line.product.id)} style={styles.minus}><Icon source="minus" size={16} color={theme.colors.onSurface} /></Pressable>
          </View>)}
          {cartLines.length > 0 && <>
            <View style={[styles.totalRow, { borderTopColor: theme.colors.outlineVariant }]}>
              <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Total</Text>
              <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>{money(cartTotal)}</Text>
            </View>
            <AppButton icon="cash-register" onPress={validate}>Encaisser {money(cartTotal)}</AppButton>
            <AppButton mode="text" onPress={() => setCart({})}>Vider le panier</AppButton>
          </>}
        </View>
      </View>}

      {step === 2 && <View style={[styles.panel, { backgroundColor: surface }]}>
        <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Stock de la boutique</Text>
        <Text style={{ color: muted }}>Une alerte vous prévient dès qu’un produit passe sous son seuil.{lastSale ? ' Les quantités tiennent compte de votre vente.' : ''}</Text>
        {catalog.map(product => {
          const qty = stock[product.id];
          const low = qty <= product.threshold;
          const ratio = Math.max(0.03, Math.min(1, qty / product.capacity));
          return <View key={product.id} style={styles.stockRow}>
            <ProductArt kind={product.id} size={46} />
            <View style={styles.grow}>
              <View style={styles.stockHead}>
                <Text numberOfLines={1} style={[styles.bold, styles.grow, { color: theme.colors.onSurface }]}>{product.name}</Text>
                <Text style={[styles.bold, { color: low ? demoPalette.tomato : theme.colors.onSurface }]}>{qty}</Text>
              </View>
              <View style={[styles.gauge, { backgroundColor: theme.colors.surfaceVariant }]}><View style={[styles.gaugeFill, { width: `${ratio * 100}%`, backgroundColor: low ? demoPalette.tomato : demoPalette.leaf }]} /></View>
              <Text style={{ color: low ? demoPalette.tomato : muted, fontSize: 12 }}>{low ? `Stock faible · seuil ${product.threshold}` : `Seuil d’alerte : ${product.threshold}`}</Text>
            </View>
          </View>;
        })}
      </View>}

      {step === 3 && <View style={styles.stack}>
        <View style={[styles.balance, { backgroundColor: demoPalette.brand }]}>
          <Text style={styles.balanceLabel}>Solde de caisse, boutique principale</Text>
          <Text variant="displaySmall" numberOfLines={1} style={styles.balanceValue}>{money(balance)}</Text>
          <Text style={styles.balanceLabel}>{movements.length} mouvements aujourd’hui</Text>
        </View>
        <View style={[styles.panel, { backgroundColor: surface }]}>
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Mouvements du jour</Text>
          {[...movements].reverse().map(movement => {
            const positive = movement.amount >= 0;
            return <View key={movement.id} style={styles.movement}>
              <View style={[styles.movementIcon, { backgroundColor: positive ? `${demoPalette.leaf}1F` : `${demoPalette.tomato}1F` }]}><Icon source={movement.icon} size={20} color={positive ? demoPalette.leaf : demoPalette.tomato} /></View>
              <View style={styles.grow}><Text style={[styles.bold, { color: theme.colors.onSurface }]}>{movement.label}</Text><Text style={{ color: muted, fontSize: 12 }}>{movement.detail}</Text></View>
              <Text style={[styles.bold, { color: positive ? demoPalette.leaf : demoPalette.tomato }]}>{positive ? '+' : '−'}{money(Math.abs(movement.amount))}</Text>
            </View>;
          })}
        </View>
      </View>}

      <View style={styles.nav}>
        <AppButton mode="outlined" disabled={step === 0} onPress={() => setStep(s => Math.max(0, s - 1))}>Précédent</AppButton>
        {last
          ? <AppButton icon="account-plus" onPress={() => router.push('/(auth)/register')}>Créer mon espace</AppButton>
          : <AppButton icon="arrow-right" contentStyle={styles.reverse} onPress={() => setStep(s => Math.min(steps.length - 1, s + 1))}>{steps[step + 1]}</AppButton>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 20, maxWidth: 1080, width: '100%', alignSelf: 'center' },
  hero: { gap: 18 },
  heroWide: { flexDirection: 'row', alignItems: 'center' },
  heroCopy: { gap: 14 },
  heroCopyWide: { flex: 1, paddingRight: 12 },
  heroTitle: { fontWeight: '900', letterSpacing: -0.8, lineHeight: 46 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scene: { width: '100%', aspectRatio: 340 / 190, maxWidth: 560, alignSelf: 'center' },
  sceneWide: { flex: 1.1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, borderRadius: 999, borderWidth: 1 },
  tabNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabNumberText: { fontWeight: '900', fontSize: 12 },
  tabLabel: { fontWeight: '700' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: demoPalette.ochre, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: demoPalette.ink, fontWeight: '900', fontSize: 11 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  stack: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '800' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, flexBasis: 200, minWidth: 0, padding: 16, borderRadius: 18, gap: 4 },
  kpiIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  panel: { padding: 18, borderRadius: 20, gap: 12 },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saleLayout: { gap: 16 },
  saleLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  products: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Tuiles « étiquette de rayon » : fond clair fixe, texte encre — lisibles dans les deux thèmes.
  productTile: { flexGrow: 1, flexBasis: 140, maxWidth: 220, minWidth: 0, padding: 12, borderRadius: 16, backgroundColor: demoPalette.mist, borderWidth: 1, borderColor: '#DCE7E5', gap: 2 },
  productArt: { alignItems: 'center', marginBottom: 6 },
  productName: { color: demoPalette.ink, fontWeight: '700' },
  productPrice: { color: demoPalette.brand, fontWeight: '900', fontSize: 16 },
  productStock: { color: '#5C6E6B', fontSize: 12 },
  tileBadge: { position: 'absolute', top: 8, right: 8, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: demoPalette.ochre, alignItems: 'center', justifyContent: 'center' },
  cart: { padding: 16, borderRadius: 20, borderWidth: 1, gap: 10 },
  cartWide: { width: 320, flexShrink: 0 },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  minus: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,75,80,0.10)' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10 },
  success: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#E5F5EC' },
  successText: { color: '#0B7A4B', fontWeight: '800' },
  successDetail: { color: '#2D6B4F', fontSize: 12, marginTop: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  stockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gauge: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 5 },
  gaugeFill: { height: '100%', borderRadius: 4 },
  balance: { padding: 22, borderRadius: 24, gap: 4 },
  balanceLabel: { color: '#CDE6E4' },
  balanceValue: { color: '#FFFFFF', fontWeight: '900', fontSize: 34 },
  movement: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  movementIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  reverse: { flexDirection: 'row-reverse' },
});
