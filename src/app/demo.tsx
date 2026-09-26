import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, Divider, Icon, IconButton, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { PageIntro } from '@/components/ui/PageIntro';
import { design } from '@/constants/design';
import { DemoThumbnail, type DemoProductKind } from '@/features/demo/DemoArt';
import { formatDateTime } from '@/utils/format';

// Démo publique, sans compte : données fictives, rien n'est enregistré.
//
// Retour du 26/09 : la démo ne doit montrer AUCUN design qui n'existe pas dans l'app.
// Chaque écran ci-dessous reproduit l'écran réel correspondant — mêmes composants
// (PageIntro, AppButton, AppSearchBar, cartes Paper), mêmes textes et mêmes styles,
// recopiés de (admin)/index, sales/new, sales/index, stock et cash, ainsi que la barre
// de navigation réelle (en bas sur téléphone, à gauche sur ordinateur). Seules les images
// des produits fictifs sont dessinées, affichées dans le cadre de vignette produit réel.
// Une vente simulée met à jour le stock, l'historique des ventes et la caisse, comme dans
// l'application.

type Tab = 'home' | 'sale' | 'sales' | 'stock' | 'cash';
type Product = { id: DemoProductKind; name: string; price: number; threshold: number };
type SaleRow = { id: string; reference: string; total: number; payment: string; createdAt: string };
type CashRow = { id: string; designation: string; amount: number; type: 'deposit' | 'withdrawal'; createdAt: string };
type MovementRow = { id: string; name: string; quantity: number; createdAt: string };

const STORE = 'Boutique Madina';
const COMPANY = 'Diallo & Fils';
const catalog: Product[] = [
  { id: 'riz', name: 'Riz 5 kg', price: 40000, threshold: 10 },
  { id: 'huile', name: 'Huile 1 L', price: 15000, threshold: 8 },
  { id: 'sucre', name: 'Sucre 1 kg', price: 8000, threshold: 12 },
  { id: 'lait', name: 'Lait en poudre', price: 22000, threshold: 6 },
  { id: 'tomate', name: 'Concentré de tomate', price: 5000, threshold: 10 },
  { id: 'savon', name: 'Savon', price: 3000, threshold: 8 },
];
const initialStock: Record<string, number> = { riz: 34, huile: 6, sucre: 52, lait: 14, tomate: 3, savon: 18 };
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
const initialSales: SaleRow[] = [
  { id: 's41', reference: 'V-00041', total: 80000, payment: 'Espèces', createdAt: hoursAgo(3) },
  { id: 's40', reference: 'V-00040', total: 30000, payment: 'Mobile Money', createdAt: hoursAgo(5) },
];
const initialCash: CashRow[] = [
  { id: 'c3', designation: 'Vente V-00041', amount: 80000, type: 'deposit', createdAt: hoursAgo(3) },
  { id: 'c2', designation: 'Approvisionnement fournisseur', amount: 120000, type: 'withdrawal', createdAt: hoursAgo(4) },
  { id: 'c1', designation: 'Fonds de caisse', amount: 175000, type: 'deposit', createdAt: hoursAgo(9) },
];
const payments = [['cash', 'Espèces'], ['mobile_money', 'Mobile Money']] as const;

// fr-CA : même format que CurrencyProvider (formatMoney) dans l'application.
const money = (value: number) => `${value.toLocaleString('fr-CA')} GNF`;
const format = (value: number) => value.toLocaleString('fr-CA');

export default function DemoScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const compact = width < 600;
  const [tab, setTab] = useState<Tab>('home');
  const [saleStep, setSaleStep] = useState<'products' | 'checkout'>('products');
  const [stock, setStock] = useState(initialStock);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<(typeof payments)[number][0]>('cash');
  const [sales, setSales] = useState(initialSales);
  const [cash, setCash] = useState(initialCash);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [lastSale, setLastSale] = useState<SaleRow | null>(null);
  const [search, setSearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');

  const items = useMemo(() => catalog.filter(p => (cart[p.id] ?? 0) > 0).map(product => ({ product, quantity: cart[product.id] })), [cart]);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const balance = cash.reduce((sum, row) => sum + (row.type === 'deposit' ? row.amount : -row.amount), 0);
  const todaySales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const lowStock = catalog.filter(p => stock[p.id] <= p.threshold).length;

  const go = (next: Tab) => { setTab(next); if (next === 'sale') { setSaleStep('products'); setLastSale(null); } };
  const setQuantity = (id: string, quantity: number) => setCart(current => ({ ...current, [id]: Math.max(0, Math.min(quantity, stock[id])) }));
  const validate = () => {
    const number = 42 + sales.length - initialSales.length;
    const sale: SaleRow = { id: `s${number}`, reference: `V-${String(number).padStart(5, '0')}`, total, payment: payments.find(([value]) => value === payment)![1], createdAt: new Date().toISOString() };
    setStock(current => { const next = { ...current }; for (const item of items) next[item.product.id] -= item.quantity; return next; });
    setMovements(current => [...items.map(item => ({ id: `${sale.id}-${item.product.id}`, name: item.product.name, quantity: -item.quantity, createdAt: sale.createdAt })), ...current]);
    setSales(current => [sale, ...current]);
    setCash(current => [{ id: `c-${sale.id}`, designation: `Vente ${sale.reference}`, amount: sale.total, type: 'deposit', createdAt: sale.createdAt }, ...current]);
    setLastSale(sale);
    setCart({});
  };

  const thumb = (kind: DemoProductKind, size = 52) => <DemoThumbnail kind={kind} size={size} background={theme.colors.surfaceVariant} />;

  const home = <>
    <PageIntro title="Votre boutique aujourd’hui" description={STORE} />
    <AppButton icon="cart-plus" onPress={() => go('sale')}>Nouvelle vente</AppButton>
    <View style={styles.metrics}>
      <Metric title="Ventes du jour" value={money(todaySales)} hint="Crédits compris, retours déduits" onPress={() => go('sales')} />
      <Metric title="Solde de caisse" value={money(balance)} hint="Entrées moins sorties enregistrées" onPress={() => go('cash')} />
      {lowStock > 0 && <Metric title="À réapprovisionner" value={String(lowStock)} hint="Produits dont le stock est faible" onPress={() => go('stock')} />}
    </View>
    {lowStock > 0 && <Card mode="outlined"><Card.Content style={styles.list}>
      <Text variant="titleMedium" style={styles.bold}>À suivre</Text>
      <AppButton mode="text" icon="package-variant" onPress={() => go('stock')}>Voir les stocks à vérifier ({lowStock})</AppButton>
    </Card.Content></Card>}
  </>;

  const catalogPane = <View style={styles.catalogPane}>
    <Text style={{ color: theme.colors.onSurfaceVariant }}>Touchez un article pour l’ajouter au panier, ou scannez son code-barres.</Text>
    <AppSearchBar placeholder="Nom ou code-barres" value={saleSearch} onChangeText={setSaleSearch} />
    <View style={styles.grid}>
      {catalog.filter(p => !saleSearch.trim() || p.name.toLocaleLowerCase('fr').includes(saleSearch.trim().toLocaleLowerCase('fr'))).map(product => {
        const inCart = cart[product.id] ?? 0;
        const available = stock[product.id] > 0;
        return <Card key={product.id} mode="contained" style={[styles.gridCard, { backgroundColor: theme.colors.surface }, !available && styles.unavailable, inCart > 0 && { borderColor: theme.colors.primary, borderWidth: 1.5 }]} onPress={available && !inCart ? () => setQuantity(product.id, 1) : undefined}>
          <View style={styles.gridImageWrap}>{thumb(product.id, 94)}</View>
          <Card.Content style={styles.gridCopy}>
            <Text variant="bodyMedium" numberOfLines={2} style={styles.center}>{product.name}</Text>
            <Text variant="titleMedium" style={styles.bold}>{money(product.price)}</Text>
            {!available && <Text variant="labelSmall" style={{ color: theme.colors.error }}>Épuisé</Text>}
          </Card.Content>
          <View style={styles.gridActions}>
            {inCart > 0 ? <View style={styles.gridStepper}>
              <IconButton mode="outlined" icon="minus" size={16} accessibilityLabel={`Retirer un ${product.name}`} onPress={() => setQuantity(product.id, inCart - 1)} />
              <Text variant="titleSmall" style={styles.bold}>{format(inCart)}</Text>
              <IconButton mode="contained" icon="plus" size={16} disabled={inCart >= stock[product.id]} accessibilityLabel={`Ajouter encore un ${product.name}`} onPress={() => setQuantity(product.id, inCart + 1)} />
            </View> : <IconButton mode="contained" icon="plus" size={18} disabled={!available} accessibilityLabel={`Ajouter ${product.name}`} onPress={() => setQuantity(product.id, 1)} />}
          </View>
        </Card>;
      })}
    </View>
  </View>;

  const cartPane = <View style={[styles.cartPane, desktop && styles.cartPaneDesktop]}>
    <Text variant="headlineSmall">Panier ({items.length})</Text>
    {!!items.length && <AppButton mode="text" icon="cart-remove" onPress={() => setCart({})}>Vider le panier</AppButton>}
    {!desktop && <AppButton mode="text" icon="plus" onPress={() => setSaleStep('products')}>Ajouter des articles</AppButton>}
    {!items.length && <Card mode="outlined"><Card.Content style={styles.emptyCart}>
      <Icon source="cart-outline" size={34} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium">Votre panier est vide</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>Touchez un produit du catalogue pour l’ajouter.</Text>
    </Card.Content></Card>}
    {items.map(({ product, quantity }) => <Card key={product.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
      <Card.Content style={styles.productRow}>
        {thumb(product.id)}
        <View style={styles.productCopy}>
          <Text variant="titleMedium">{product.name}</Text>
          <Text>{money(product.price)}</Text>
          <Text>Disponible : {format(stock[product.id])}</Text>
        </View>
        <IconButton icon="delete" accessibilityLabel={`Retirer ${product.name} du panier`} onPress={() => setQuantity(product.id, 0)} />
      </Card.Content>
      <Card.Content style={styles.quantityRow}>
        <IconButton mode="outlined" icon="minus" accessibilityLabel="Diminuer la quantité" disabled={quantity <= 1} onPress={() => setQuantity(product.id, quantity - 1)} />
        <Text variant="titleMedium" style={styles.quantityValue}>{format(quantity)}</Text>
        <IconButton mode="contained" icon="plus" accessibilityLabel="Augmenter la quantité" disabled={quantity >= stock[product.id]} onPress={() => setQuantity(product.id, quantity + 1)} />
      </Card.Content>
    </Card>)}
    <Text variant="titleMedium">Paiement</Text>
    <View style={styles.paymentGrid}>{payments.map(([value, label]) => <Chip key={value} selected={payment === value} onPress={() => setPayment(value)}>{label}</Chip>)}</View>
    <Card mode="contained" style={[styles.checkout, { backgroundColor: theme.colors.primaryContainer }]}>
      <Card.Content style={styles.checkoutContent}>
        <Icon source="cart-check" size={32} color={theme.colors.primary} />
        <View style={styles.grow}><Text variant="headlineSmall">Total : {money(total)}</Text></View>
      </Card.Content>
    </Card>
    {desktop && <AppButton icon="check" disabled={!items.length} onPress={validate}>Valider · {money(total)}</AppButton>}
  </View>;

  // Après validation : même carte que le haut du détail de vente réel ((admin)/sales/[id]).
  const saleDone = lastSale && <Card mode="contained"><Card.Content style={styles.list}>
    <Text variant="labelLarge">Vente simulée · Aucun reçu réel n’a été envoyé.</Text>
    <Text variant="headlineMedium">{money(lastSale.total)}</Text>
    <Text>{formatDateTime(lastSale.createdAt)} · {lastSale.reference}</Text>
    <Text>Paiement reçu</Text>
    <View style={styles.row}>
      <AppButton icon="cart-plus" onPress={() => { setLastSale(null); setSaleStep('products'); }}>Nouvelle vente</AppButton>
      <AppButton mode="outlined" icon="warehouse" onPress={() => go('stock')}>Voir le stock</AppButton>
      <AppButton mode="text" icon="wallet-outline" onPress={() => go('cash')}>Voir la caisse</AppButton>
    </View>
  </Card.Content></Card>;

  const sale = <>
    <PageIntro title="Nouvelle vente" description="Choisissez les articles, puis vérifiez le panier et le paiement." />
    {saleDone}
    {!lastSale && <>
      {!desktop && <SegmentedButtons value={saleStep} onValueChange={value => setSaleStep(value as typeof saleStep)} buttons={[
        { value: 'products', label: 'Articles', icon: 'package-variant' },
        { value: 'checkout', label: `Panier (${items.length})`, icon: 'cart-outline' },
      ]} />}
      <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
        {(desktop || saleStep === 'products') && catalogPane}
        {(desktop || saleStep === 'checkout') && cartPane}
      </View>
    </>}
  </>;

  const salesList = <>
    <PageIntro title="Ventes" action={<AppButton icon="plus" onPress={() => go('sale')}>Ajouter</AppButton>} />
    <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
      <Text style={{ color: theme.colors.onPrimaryContainer }}>Total des ventes</Text>
      <Text numberOfLines={1} style={[styles.heroAmount, { color: theme.colors.onPrimaryContainer }]}>{money(todaySales)}</Text>
      <Text style={{ color: theme.colors.onPrimaryContainer }}>{sales.length === 1 ? '1 vente affichée' : `${sales.length} ventes affichées`}</Text>
    </View>
    {sales.map(row => <Card key={row.id} mode="outlined"><Card.Title title={row.reference} subtitle={`${row.payment} · ${formatDateTime(row.createdAt)}`}
      left={() => <View style={[styles.saleIcon, { backgroundColor: theme.colors.primaryContainer }]}><Icon source="check" size={20} color={theme.colors.primary} /></View>}
      right={() => <Text style={[styles.bold, styles.rightValue]}>{money(row.total)}</Text>} /></Card>)}
  </>;

  const needle = search.trim().toLocaleLowerCase('fr');
  const stockRows = catalog.filter(p => !needle || p.name.toLocaleLowerCase('fr').includes(needle));
  const stockScreen = <>
    <PageIntro title="Stock" description="Consultez les quantités disponibles. Pour vérifier les quantités réelles, utilisez Compter le stock." />
    <View style={[styles.summary, compact && styles.compactSummary, { backgroundColor: theme.colors.primaryContainer }]}>
      <View style={styles.summaryMetrics}>
        {[['Produits référencés', String(catalog.length)], ['Quantité totale', format(catalog.reduce((s, p) => s + stock[p.id], 0))], ['Valeur de vente du stock', money(catalog.reduce((s, p) => s + stock[p.id] * p.price, 0))]].map(([label, value]) =>
          <View key={label} style={[styles.summaryMetric, compact && styles.compactMetric]}>
            <Text style={{ color: theme.colors.onPrimaryContainer }}>{label}</Text>
            <Text numberOfLines={1} style={[styles.bold, styles.summaryValue, { color: theme.colors.onPrimaryContainer }]}>{value}</Text>
          </View>)}
      </View>
    </View>
    <AppSearchBar placeholder="Produit ou boutique" value={search} onChangeText={setSearch} />
    {!compact && <View style={[styles.tableHeader, { borderColor: theme.colors.outlineVariant }]}>
      <Text style={[styles.productColumn, styles.bold]}>Produit</Text>
      <Text style={[styles.storeColumn, styles.bold]}>Boutique</Text>
      <Text style={[styles.numberColumn, styles.bold]}>Quantité</Text>
      <Text style={[styles.numberColumn, styles.bold]}>Prix de vente</Text>
    </View>}
    {stockRows.map(product => {
      const quantityColor = stock[product.id] <= product.threshold ? theme.colors.error : theme.colors.primary;
      return <Card key={product.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Content style={[styles.tableRow, compact && styles.compactTableRow]}>
          <View style={[styles.productColumn, compact && styles.fullWidth]}><Text variant="titleSmall" style={styles.bold} numberOfLines={2}>{product.name}</Text></View>
          <Text style={[styles.storeColumn, compact && styles.compactValue]}>{compact ? `Boutique : ${STORE}` : STORE}</Text>
          <Text style={[styles.numberColumn, compact && styles.compactValue, styles.bold, { color: quantityColor }]}>{compact ? `Quantité : ${format(stock[product.id])}` : format(stock[product.id])}</Text>
          <Text style={[styles.numberColumn, compact && styles.compactValue, styles.bold]}>{compact ? `Prix : ${money(product.price)}` : money(product.price)}</Text>
        </Card.Content>
      </Card>;
    })}
    {movements.length > 0 && <>
      <Text variant="titleLarge" style={styles.bold}>Derniers mouvements</Text>
      {movements.map(movement => <Card key={movement.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Content style={styles.movement}>
          <View style={[styles.movementIcon, { backgroundColor: theme.colors.errorContainer }]}><Icon source="arrow-up-right" size={22} color={theme.colors.error} /></View>
          <View style={styles.grow}>
            <Text variant="titleSmall" style={styles.bold} numberOfLines={2}>{movement.name}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>{STORE} · {formatDateTime(movement.createdAt)}</Text>
          </View>
          <Text style={[styles.bold, { color: theme.colors.error }]}>{format(movement.quantity)}</Text>
        </Card.Content>
      </Card>)}
    </>}
  </>;

  const cashScreen = <>
    <PageIntro title="Caisse" />
    <Card mode="contained" style={[styles.balance, { backgroundColor: theme.colors.primaryContainer }]}>
      <Card.Content>
        <Text style={{ color: theme.colors.onPrimaryContainer }}>Solde de {STORE}</Text>
        <Text numberOfLines={1} style={[styles.bold, styles.heroAmountLarge, { color: theme.colors.onPrimaryContainer }]}>{money(balance)}</Text>
      </Card.Content>
    </Card>
    <Text variant="titleLarge" style={styles.bold}>Historique des mouvements</Text>
    {cash.map(row => {
      const deposit = row.type === 'deposit';
      return <Card key={row.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Content style={styles.transaction}>
          <View style={[styles.transactionIcon, { backgroundColor: deposit ? theme.colors.primaryContainer : theme.colors.errorContainer }]}><Icon source={deposit ? 'arrow-down-left' : 'arrow-up-right'} size={23} color={deposit ? theme.colors.primary : theme.colors.error} /></View>
          <View style={styles.transactionCopy}><Text variant="titleMedium" style={styles.bold}>{row.designation}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{STORE} · {formatDateTime(row.createdAt)}</Text></View>
          <Text numberOfLines={1} style={[styles.bold, { fontSize: 13, color: deposit ? theme.colors.primary : theme.colors.error }]}>{deposit ? '+' : '−'}{money(row.amount)}</Text>
        </Card.Content>
      </Card>;
    })}
  </>;

  const links: { tab: Tab; label: string; icon: string }[] = [
    { tab: 'home', label: 'Accueil', icon: desktop ? 'view-dashboard-outline' : 'home-outline' },
    { tab: 'sales', label: 'Ventes', icon: 'cart-outline' },
    { tab: 'stock', label: 'Stock', icon: 'warehouse' },
    { tab: 'cash', label: 'Caisse', icon: 'wallet-outline' },
  ];
  const activeTab: Tab = tab === 'sale' ? 'sales' : tab;
  const floatingAction = !desktop && tab === 'sale' && !lastSale
    ? saleStep === 'products'
      ? <AppButton icon="cart-outline" style={styles.stretch} disabled={!items.length} onPress={() => setSaleStep('checkout')}>Panier · {money(total)}</AppButton>
      : <AppButton icon="check" style={styles.stretch} disabled={!items.length} onPress={validate}>Valider · {money(total)}</AppButton>
    : null;

  return <View style={[styles.flex, desktop && styles.row0, { backgroundColor: theme.colors.background }]}>
    {/* Menu latéral : reproduction de AdminNavigation (ordinateur). */}
    {desktop && <View style={[styles.sidebar, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.outlineVariant }]}>
      <View style={styles.brand}>
        <Image source={require('../../assets/images/stockmaster-icon.png')} style={styles.logo} contentFit="cover" />
        <View style={styles.grow}><Text variant="titleLarge" style={styles.brandTitle}>StockMaster</Text><Text variant="bodySmall" numberOfLines={1}>{COMPANY}</Text><Text variant="labelSmall" numberOfLines={1}>{STORE}</Text></View>
      </View>
      <Divider />
      <View style={styles.group}>
        <Text variant="labelSmall" style={styles.groupLabel}>PRINCIPAL</Text>
        {links.map(link => <Pressable key={link.tab} accessibilityRole="button" accessibilityLabel={link.label} accessibilityState={{ selected: activeTab === link.tab }} onPress={() => go(link.tab)} style={({ pressed }) => [styles.navItem, activeTab === link.tab && styles.navItemActive, pressed && styles.pressed]}>
          <Icon source={link.icon} size={23} color={activeTab === link.tab ? design.colors.brand : theme.colors.onSurfaceVariant} />
          <Text style={[styles.navText, activeTab === link.tab && { color: design.colors.brand }]}>{link.label}</Text>
        </Pressable>)}
      </View>
    </View>}
    <View style={styles.flex}>
      <Appbar.Header elevated style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction accessibilityLabel="Quitter la démo" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))} />
        <Appbar.Content title={STORE} subtitle={COMPANY} titleStyle={compact ? styles.compactTitle : undefined} subtitleStyle={styles.bold} />
      </Appbar.Header>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.page, compact && styles.compactPage]}>
        {/* Seul ajout propre à la démo : l'avertissement, présenté comme les autres encadrés de l'app. */}
        <Card mode="outlined"><Card.Content style={styles.notice}>
          <Icon source="information-outline" size={24} color={theme.colors.primary} />
          <Text style={styles.noticeText}>Démonstration : données fictives, rien n’est enregistré.</Text>
          <AppButton mode="text" icon="account-plus" onPress={() => router.push('/(auth)/register')}>Créer mon espace</AppButton>
        </Card.Content></Card>
        {tab === 'home' && home}
        {tab === 'sale' && sale}
        {tab === 'sales' && salesList}
        {tab === 'stock' && stockScreen}
        {tab === 'cash' && cashScreen}
      </ScrollView>
      {!!floatingAction && <View style={[styles.actionFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>{floatingAction}</View>}
      {/* Barre du bas : reproduction de AdminNavigation (téléphone). */}
      {!desktop && <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 6), backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>
        {links.map(link => <Pressable key={link.tab} accessibilityRole="button" accessibilityLabel={link.label} accessibilityState={{ selected: activeTab === link.tab }} onPress={() => go(link.tab)} style={({ pressed }) => [styles.bottomItem, activeTab === link.tab && styles.bottomItemActive, pressed && styles.pressed]}>
          <Icon source={link.icon} size={22} color={activeTab === link.tab ? design.colors.brand : theme.colors.onSurfaceVariant} />
          <Text numberOfLines={1} style={[styles.bottomLabel, activeTab === link.tab && { color: design.colors.brand }]}>{link.label}</Text>
        </Pressable>)}
      </View>}
    </View>
  </View>;
}

// Même carte que Metric de l'accueil réel ((admin)/index.tsx).
function Metric({ title, value, hint, onPress }: { title: string; value: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  return <Card mode="contained" style={[styles.metric, { backgroundColor: theme.colors.surface }]} onPress={onPress}>
    <Card.Content style={styles.list}>
      <Text variant="titleSmall">{title}</Text>
      <Text variant="headlineSmall" style={styles.bold}>{value}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{hint}</Text>
    </Card.Content>
  </Card>;
}

// Styles recopiés des écrans réels (AdminPage, AdminNavigation, (admin)/index, sales/new,
// sales/index, stock, cash) pour que la démo leur soit identique.
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, minHeight: 0 },
  row0: { flexDirection: 'row' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '800' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  pressed: { opacity: 0.72 },
  page: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: design.contentMaxWidth, alignSelf: 'center' },
  compactPage: { padding: 12, paddingBottom: 28, gap: 12 },
  compactTitle: { fontSize: 18 },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  noticeText: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  list: { gap: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  workspace: { gap: 16 },
  workspaceDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  catalogPane: { flex: 1, gap: 12, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCard: { flexBasis: 111, flexGrow: 1, minWidth: 106, maxWidth: 210, overflow: 'hidden' },
  gridImageWrap: { alignItems: 'center', paddingTop: 14, paddingBottom: 4 },
  gridCopy: { alignItems: 'center', gap: 3, paddingTop: 2, paddingHorizontal: 10 },
  gridActions: { alignItems: 'center', justifyContent: 'center', paddingBottom: 8, paddingTop: 4 },
  gridStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 2 },
  unavailable: { opacity: 0.72 },
  cartPane: { gap: 12 },
  cartPaneDesktop: { width: 400, flexShrink: 0 },
  emptyCart: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  productRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productCopy: { flex: 1, minWidth: 0, gap: 4 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityValue: { minWidth: 48, textAlign: 'center' },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkout: { borderRadius: 22 },
  checkoutContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hero: { padding: 20, borderRadius: 24, gap: 4 },
  heroAmount: { fontSize: 18, fontWeight: '800' },
  heroAmountLarge: { fontSize: 20 },
  saleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rightValue: { marginRight: 16 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: 20, borderRadius: 24 },
  compactSummary: { flexDirection: 'column', alignItems: 'stretch', padding: 16 },
  summaryMetrics: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  summaryMetric: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  compactMetric: { flexBasis: '45%' },
  summaryValue: { fontSize: 11 },
  tableHeader: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactTableRow: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  compactValue: { minWidth: 0, width: '100%', textAlign: 'left' },
  fullWidth: { minWidth: 0, width: '100%' },
  productColumn: { flex: 2, minWidth: 100 },
  storeColumn: { flex: 1.3, minWidth: 75 },
  numberColumn: { flex: 1, minWidth: 65, textAlign: 'right' },
  movement: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  movementIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  balance: { borderRadius: 24 },
  transaction: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  transactionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  actionFooter: { flexShrink: 0, borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  sidebar: { width: 264, flexShrink: 0, padding: 14, borderRightWidth: 1, gap: 12 },
  brand: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 46, height: 46, borderRadius: 14 },
  brandTitle: { fontWeight: '900', color: design.colors.brand },
  group: { gap: 4 },
  groupLabel: { color: design.colors.muted, fontWeight: '800', paddingHorizontal: 12, marginBottom: 2 },
  navItem: { minHeight: 44, borderRadius: design.radius.small, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  navItemActive: { backgroundColor: design.colors.brandSoft, borderLeftWidth: 3, borderLeftColor: design.colors.brand, paddingLeft: 9 },
  navText: { minWidth: 0, fontWeight: '700' },
  bottom: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, paddingHorizontal: 2, paddingTop: 5 },
  bottomItem: { flex: 1, minWidth: 0, minHeight: 54, paddingHorizontal: 1, gap: 2, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  bottomItemActive: { backgroundColor: design.colors.brandSoft },
  bottomLabel: { fontSize: 11, textAlign: 'center', fontWeight: '700' },
});
