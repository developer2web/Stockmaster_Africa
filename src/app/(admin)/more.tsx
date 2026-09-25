import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow, ListSection } from '@/components/ui/ListSection';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { moduleFeatures } from '@/features/subscriptions/featureAccess';
import { supabase } from '@/services/supabase/client';
import { companyInitials } from '@/utils/initials';

// Nouvelle structure (retour testeur du 24/09, captures Uber Driver) : une
// liste continue divisée par section plutôt qu'une grille de cartes, un
// raccourci Assistance/Sécurité/Paramètres en haut et le compte actif en
// bas — chaque outil n'apparaît qu'à un seul endroit (les liens Entreprise,
// Boutiques et Abonnement vivent désormais uniquement dans Paramètres).
const dailySection = { title: 'Gestion quotidienne', items: [
  ['Produits', 'Catalogue et prix', 'package-variant-closed', '/products'],
  ['Clients et crédits', 'Retrouver un client ou encaisser sa dette', 'account-group-outline', '/customers'],
  ['Rapports', 'Ventes et performance', 'chart-box-outline', '/reports'],
  ['Recevoir du stock', 'Enregistrer un achat et sa réception', 'truck-check-outline', '/purchases'],
  ['Fournisseurs', 'Comptes, dettes et règlements', 'truck-outline', '/suppliers'],
  ['Dépenses', 'Charges de la boutique', 'cash-minus', '/expenses'],
] } as const;
const teamSection = { title: 'Équipe', items: [
  ['Employés', 'Comptes et accès', 'account-hard-hat-outline', '/employees'],
  ['Rôles', 'Permissions personnalisées', 'shield-account-outline', '/roles'],
] } as const;
const operationsSection = { title: 'Opérations', items: [
  ['Scanner', 'Codes-barres et QR codes', 'barcode-scan', '/scanner'],
  ['Compter le stock', 'Comparer le comptage réel au stock enregistré', 'clipboard-check-outline', '/inventory-count'],
  ['Transferts entre boutiques', 'Déplacer du stock d’une boutique à une autre', 'swap-horizontal', '/transfers'],
  ['Commandes clients', 'Réservations et acomptes', 'clipboard-list-outline', '/orders'],
  ['Journal d’activité', 'Opérations importantes de l’entreprise', 'history', '/activity'],
] } as const;

export default function MoreScreen() {
  const theme = useTheme();
  const { canViewFeature: canUseFeature, isLoading, error: subscriptionError, refreshSubscription } = useSubscription();
  const { membership, businesses, stores } = useAuth();
  const { signOut, signingOut } = useSignOutAction();
  const companyId = membership?.companyId;
  // Rôles personnalisés n'a rien à quoi s'appliquer tant qu'il n'y a que le
  // propriétaire (sa propre adhésion est déjà l'une des lignes comptées) —
  // masqué jusqu'à la première invitation, jamais supprimé : il revient
  // dès qu'un employé rejoint. Compte minimal (head:true), pas la liste.
  const teamCount = useQuery({
    queryKey: ['more-team-count', companyId],
    queryFn: async () => {
      const { count, error } = await supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('company_id', companyId!).eq('is_active', true);
      if (error) throw error;
      return count ?? 1;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const hasTeammates = (teamCount.data ?? 1) > 1;
  const sections = useMemo(() => [
    dailySection,
    { ...teamSection, items: teamSection.items.filter(([label]) => label !== 'Rôles' || hasTeammates) },
    operationsSection,
  ], [hasTeammates]);
  const canSwitchScope = businesses.length > 1 || stores.length > 1;

  return <AdminPage title="Menu" backToHome>
    {!!subscriptionError && <View><HelperText type="error" visible>Les fonctionnalités de votre forfait n’ont pas pu être vérifiées.</HelperText><AppButton mode="text" onPress={() => void refreshSubscription()}>Actualiser le forfait</AppButton></View>}

    <View style={styles.quickRow}>
      <QuickAction icon="lifebuoy" label="Assistance" onPress={() => router.push('/support')} />
      <QuickAction icon="shield-key-outline" label="Sécurité" onPress={() => router.push('/(settings)/security' as never)} />
      <QuickAction icon="cog-outline" label="Paramètres" onPress={() => router.push('/(settings)')} />
    </View>

    {sections.map(section => {
      const items = section.items.filter(([label]) => {
        const feature = moduleFeatures[label];
        return !feature || (!isLoading && canUseFeature(feature));
      });
      if (!items.length) return null;
      return (
        <ListSection key={section.title} title={section.title}>
          {items.map(([label, description, icon, path], index) => (
            <ListRow
              key={label}
              icon={icon}
              title={label}
              subtitle={description}
              last={index === items.length - 1}
              onPress={() => router.push({ pathname: path as never, params: { returnTo: '/more' } })}
            />
          ))}
        </ListSection>
      );
    })}

    <View style={styles.accountRow}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.avatarText}>{companyInitials(membership?.companyName)}</Text>
      </View>
      <View style={styles.grow}>
        <Text variant="titleSmall" style={styles.bold} numberOfLines={1}>{membership?.companyName || 'StockMaster'}</Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{membership?.storeName || 'Boutique'}</Text>
      </View>
    </View>
    <ListSection title="Compte">
      {canSwitchScope && <ListRow icon="swap-horizontal" title="Changer de boutique" onPress={() => router.push(businesses.length > 1 ? '/choose-business' : '/choose-store')} />}
      <ListRow icon="logout" title="Se déconnecter" danger last onPress={signOut} />
    </ListSection>
    {signingOut && <HelperText type="info" visible>Déconnexion…</HelperText>}
  </AdminPage>;
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickItem, { backgroundColor: theme.colors.surfaceVariant }, pressed && styles.pressed]}>
      <Icon source={icon} size={24} color={theme.colors.primary} />
      <Text variant="labelMedium" style={styles.bold}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickItem: { flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', gap: 8 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },
});
