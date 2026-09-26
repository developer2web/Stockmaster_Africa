import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { ListRow, ListSection } from '@/components/ui/ListSection';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { employeeToolLinks } from '@/components/navigation/employeeLinks';
import { companyInitials } from '@/utils/initials';

// Retour testeur du 25/09 : même liste divisée que Menu côté admin (au lieu de
// la grille de cartes précédente, jugée « moche »), et « Se déconnecter »
// vit désormais ici plutôt qu'en haut de l'Accueil, où il était trop facile
// de le toucher par erreur.
export default function EmployeeMoreScreen() {
  const theme = useTheme();
  const { membership, stores } = useAuth();
  const { signOut, signingOut } = useSignOutAction();
  // Liste partagée avec le menu latéral (ordinateur), pour qu'elles ne divergent jamais.
  const items = employeeToolLinks(membership);
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
