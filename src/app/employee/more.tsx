import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { ListRow, ListSection } from '@/components/ui/ListSection';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { hasAnyPermission } from '@/features/auth/permissions';
import { canUseNotifications } from '@/features/notifications/access';
import { companyInitials } from '@/utils/initials';

// Retour testeur du 25/09 : même liste divisée que Menu côté admin (au lieu de
// la grille de cartes précédente, jugée « moche »), et « Se déconnecter »
// vit désormais ici plutôt qu'en haut de l'Accueil, où il était trop facile
// de le toucher par erreur.
export default function EmployeeMoreScreen() {
  const theme = useTheme();
  const { membership, stores } = useAuth();
  const { signOut, signingOut } = useSignOutAction();
  const items = [
    { label: 'Notifications', description: 'Vos alertes et messages', icon: 'bell-outline', path: '/employee/notifications', permissions: [] },
    { label: 'Fournisseurs', description: 'Consulter les partenaires', icon: 'truck-outline', path: '/employee/suppliers', permissions: ['suppliers.read', 'suppliers.write'] },
    { label: 'Catalogue', description: 'Produits et fournisseurs autorisés', icon: 'book-open-page-variant-outline', path: '/employee/catalog', permissions: ['products.read', 'suppliers.read'] },
    { label: 'Comptabilité', description: 'Achats, dépenses et paiements', icon: 'calculator-variant-outline', path: '/employee/accounting', permissions: ['purchases.read', 'payments.read', 'expenses.read'] },
    { label: 'Dépenses', description: 'Consulter ou enregistrer les charges', icon: 'cash-minus', path: '/employee/expenses', permissions: ['expenses.read', 'expenses.write'] },
    { label: 'Rapports', description: 'Ventes et performances', icon: 'chart-box-outline', path: '/employee/reports', permissions: ['daily_reports.read', 'monthly_reports.read'] },
    { label: 'Scanner', description: 'Lire un code-barres ou QR code', icon: 'barcode-scan', path: '/employee/scanner', permissions: ['products.read', 'sales.write'] },
  ].filter(item => item.path === '/employee/notifications'
    ? canUseNotifications(membership)
    : hasAnyPermission(membership, item.permissions));
  const canSwitchStore = stores.length > 1;

  return <AdminPage title="Plus">
    {!!items.length && <ListSection title="Outils">
      {items.map((item, index) => (
        <ListRow
          key={item.label}
          icon={item.icon}
          title={item.label}
          subtitle={item.description}
          last={index === items.length - 1}
          onPress={() => router.push({ pathname: item.path as never, params: { returnTo: '/employee/more' } })}
        />
      ))}
    </ListSection>}
    <ListSection title="Paramètres">
      <ListRow icon="cog-outline" title="Paramètres" subtitle="Compte, sécurité et confidentialité" last onPress={() => router.push({ pathname: '/employee/settings' as never, params: { returnTo: '/employee/more' } })} />
    </ListSection>

    <View style={styles.accountRow}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[styles.avatarText, { color: theme.colors.primary }]}>{companyInitials(membership?.companyName)}</Text>
      </View>
      <View style={styles.grow}>
        <Text variant="titleSmall" style={styles.bold} numberOfLines={1}>{membership?.companyName || 'StockMaster'}</Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{membership?.storeName || 'Boutique'}</Text>
      </View>
    </View>
    <ListSection title="Compte">
      {canSwitchStore && <ListRow icon="swap-horizontal" title="Changer de boutique" onPress={() => router.push('/choose-store' as never)} />}
      <ListRow icon="logout" title="Se déconnecter" danger last onPress={signOut} />
    </ListSection>
    {signingOut && <Text style={{ color: theme.colors.onSurfaceVariant }}>Déconnexion…</Text>}
  </AdminPage>;
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
  grow: { flex: 1, minWidth: 0 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
