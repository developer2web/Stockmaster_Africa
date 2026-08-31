import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasAnyPermission } from '@/features/auth/permissions';

export default function EmployeeMoreScreen() {
  const theme = useTheme();
  const { membership } = useAuth();
  const items = [
    { label: 'Fournisseurs', description: 'Consulter les partenaires', icon: 'truck-outline', path: '/employee/suppliers', permissions: ['suppliers.read', 'suppliers.write'] },
    { label: 'Catalogue', description: 'Produits et fournisseurs autorisés', icon: 'book-open-page-variant-outline', path: '/employee/catalog', permissions: ['products.read', 'categories.read', 'suppliers.read'] },
    { label: 'Comptabilité', description: 'Achats, dépenses et paiements', icon: 'calculator-variant-outline', path: '/employee/accounting', permissions: ['purchases.read', 'payments.read', 'expenses.read'] },
    { label: 'Dépenses', description: 'Consulter ou enregistrer les charges', icon: 'cash-minus', path: '/employee/expenses', permissions: ['expenses.read', 'expenses.write'] },
    { label: 'Rapports', description: 'Ventes et performances', icon: 'chart-box-outline', path: '/employee/reports', permissions: ['daily_reports.read', 'monthly_reports.read'] },
    { label: 'Scanner', description: 'Lire un code-barres ou QR code', icon: 'barcode-scan', path: '/employee/scanner', permissions: ['products.read', 'sales.write'] },
  ].filter(item => hasAnyPermission(membership, item.permissions));

  return <AdminPage title="Autres outils">
    <View style={styles.grid}>{items.map(item => <Card key={item.label} mode="outlined" onPress={() => router.push({pathname:item.path as never,params:{returnTo:'/employee/more'}})} style={styles.card}><Card.Content style={styles.row}><View style={[styles.icon, { backgroundColor: theme.colors.secondaryContainer }]}><Icon source={item.icon} size={25} color={theme.colors.secondary}/></View><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{item.label}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.description}</Text></View><Icon source="chevron-right" size={22}/></Card.Content></Card>)}</View>
    <Card mode="outlined" onPress={() => router.push({pathname:'/employee/settings' as never,params:{returnTo:'/employee/more'}})}><Card.Content style={styles.row}><Icon source="cog-outline" size={28} color={theme.colors.primary}/><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>Paramètres</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Compte, sécurité et confidentialité</Text></View><Icon source="chevron-right" size={22}/></Card.Content></Card>
  </AdminPage>;
}

const styles = StyleSheet.create({ grid: { gap: 10 }, card: { borderRadius: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, minWidth: 0 }, bold: { fontWeight: '800' } });
