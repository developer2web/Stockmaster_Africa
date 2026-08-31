import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { useState } from 'react';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { FeatureKey } from '@/features/subscriptions/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';

const gatedModules:Record<string,{feature:FeatureKey;tier:string}>={
  'Inventaire':{feature:'inventory_count',tier:'Pro'},
  'Transferts':{feature:'transfers',tier:'Pro'},
  'Rôles':{feature:'advanced_permissions',tier:'Pro'},
};

const sections = [
  { title: 'Gestion', subtitle: 'Outils complémentaires', items: [
    ['Abonnement', 'Forfait, renouvellement et paiements', 'credit-card-cog-outline', '/(subscription)'],
    ['Clients', 'Fiches clients et crédits', 'account-group-outline', '/customers'],
    ['Rapports', 'Ventes et performance', 'chart-box-outline', '/reports'],
    ['Fournisseurs', 'Comptes, dettes et règlements', 'truck-outline', '/suppliers'],
    ['Dépenses', 'Charges de la boutique', 'cash-minus', '/expenses'],
    ['Employés', 'Comptes et accès', 'account-hard-hat-outline', '/employees'],
    ['Paramètres', 'Compte, sécurité et mode hors ligne', 'cog-outline', '/(settings)'],
  ]},
  { title: 'Plus d’informations', subtitle: 'Fonctions utilisées moins souvent', items: [
    ['Produits', 'Catalogue et prix', 'package-variant-closed', '/products'],
    ['Catégories', 'Organiser et classer les produits', 'shape-outline', '/categories'],
    ['Scanner', 'Codes-barres et QR codes', 'barcode-scan', '/scanner'],
    ['Inventaire', 'Comptage physique', 'clipboard-check-outline', '/inventory-count'],
    ['Approvisionnement', 'Achats et réceptions', 'truck-check-outline', '/purchases'],
    ['Transferts', 'Déplacer le stock', 'swap-horizontal-bold', '/transfers'],
    ['Commandes clients', 'Réservations et acomptes', 'clipboard-list-outline', '/orders'],
    ['Rôles', 'Permissions personnalisées', 'shield-account-outline', '/roles'],
    ['Boutiques', 'Points de vente et reçus', 'store-cog-outline', '/stores'],
    ['Entreprise', 'Coordonnées et règles', 'office-building-cog-outline', '/company'],
    ['Assistance', 'Contacter le support', 'lifebuoy', '/support'],
  ]},
] as const;

export default function MoreScreen() {
  const theme = useTheme();
  const { canUseFeature, isLoading } = useSubscription();
  const { signOut, membership } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [accountError, setAccountError] = useState('');
  const openPlans = () => {
    if (openingAccount) return;
    setOpeningAccount(true); setAccountError('');
    void openAccountPortal(membership?.companyId ?? '').catch((error) => setAccountError(error.message)).finally(() => setOpeningAccount(false));
  };
  return <AdminPage title="Tous les outils" backToHome>
    <AppButton mode="outlined" destructive icon="logout" onPress={() => void signOut()}>Se déconnecter</AppButton>
    {sections.slice(0, 1).map(section => <ModuleSection key={section.title} section={section} isLoading={isLoading} canUseFeature={canUseFeature} theme={theme} openPlans={openPlans}/>) }
    {!!accountError && <HelperText type="error" visible>{accountError}</HelperText>}
    <AppButton mode="outlined" icon={showAdvanced?'chevron-up':'chevron-down'} onPress={()=>setShowAdvanced(value=>!value)}>{showAdvanced?'Masquer les options':'Plus d’informations'}</AppButton>
    {showAdvanced && sections.slice(1).map(section => <ModuleSection key={section.title} section={section} isLoading={isLoading} canUseFeature={canUseFeature} theme={theme} openPlans={openPlans}/>) }
  </AdminPage>;
}

function ModuleSection({section,isLoading,canUseFeature,theme,openPlans}:{section:(typeof sections)[number];isLoading:boolean;canUseFeature:(feature:FeatureKey)=>boolean;theme:MD3Theme;openPlans:()=>void}) {
  return <View style={styles.section}><View><Text variant="titleLarge" style={styles.bold}>{section.title}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{section.subtitle}</Text></View><View style={styles.grid}>{section.items.map(([label, description, icon, path]) => {const gate=gatedModules[label];const locked=!isLoading&&!!gate&&!canUseFeature(gate.feature);const opensAccount=label==='Abonnement'||locked;return <Card key={label} mode="outlined" onPress={() => opensAccount?openPlans():router.push({pathname:path as never,params:{returnTo:'/more'}})} style={styles.card}><Card.Content style={styles.content}><View style={[styles.icon, { backgroundColor: locked?theme.colors.surfaceVariant:theme.colors.secondaryContainer }]}><Icon source={locked?'lock-outline':icon} size={25} color={locked?theme.colors.onSurfaceVariant:theme.colors.secondary}/></View><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{label}</Text><Text numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{locked?`${description} · Forfait ${gate.tier}`:description}</Text></View><Icon source={locked?'lock-outline':'chevron-right'} size={22} color={theme.colors.onSurfaceVariant}/></Card.Content></Card>})}</View></View>;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14 }, bold: { fontWeight: '800' }, grow: { flex: 1, minWidth: 0 },
  section: { gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, card: { flexGrow: 1, flexBasis: '46%', minWidth: 280 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
