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
  'Compter le stock':{feature:'inventory_count',tier:'Pro'},
  'Rôles':{feature:'advanced_permissions',tier:'Pro'},
  'Recevoir du stock':{feature:'supplier_debt',tier:'Pro'},
  'Journal d’activité':{feature:'audit_log',tier:'Pro'},
};

const sections = [
  { title: 'Gestion quotidienne', subtitle: 'Les outils les plus utilisés', items: [
    ['Produits', 'Catalogue et prix', 'package-variant-closed', '/products'],
    ['Clients et crédits', 'Retrouver un client ou encaisser sa dette', 'account-group-outline', '/customers'],
    ['Rapports', 'Ventes et performance', 'chart-box-outline', '/reports'],
    ['Recevoir du stock', 'Enregistrer un achat et sa réception', 'truck-check-outline', '/purchases'],
    ['Fournisseurs', 'Comptes, dettes et règlements', 'truck-outline', '/suppliers'],
    ['Dépenses', 'Charges de la boutique', 'cash-minus', '/expenses'],
  ]},
  { title: 'Gestion avancée', subtitle: 'Outils à utiliser selon les besoins', items: [
    ['Abonnement', 'Forfait, renouvellement et paiements', 'credit-card-cog-outline', '/(subscription)'],
    ['Scanner', 'Codes-barres et QR codes', 'barcode-scan', '/scanner'],
    ['Compter le stock', 'Comparer le comptage réel au stock enregistré', 'clipboard-check-outline', '/inventory-count'],
    ['Commandes clients', 'Réservations et acomptes', 'clipboard-list-outline', '/orders'],
    ['Employés', 'Comptes et accès', 'account-hard-hat-outline', '/employees'],
    ['Rôles', 'Permissions personnalisées', 'shield-account-outline', '/roles'],
    ['Entreprise', 'Coordonnées et règles', 'office-building-cog-outline', '/company'],
    ['Journal d’activité', 'Opérations importantes de l’entreprise', 'history', '/activity'],
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
    {sections.slice(0, 1).map(section => <ModuleSection key={section.title} section={section} isLoading={isLoading} canUseFeature={canUseFeature} theme={theme} openPlans={openPlans}/>) }
    {!!accountError && <HelperText type="error" visible>{accountError}</HelperText>}
    <AppButton mode="outlined" icon={showAdvanced?'chevron-up':'chevron-down'} onPress={()=>setShowAdvanced(value=>!value)}>{showAdvanced?'Masquer la gestion avancée':'Gestion avancée'}</AppButton>
    {showAdvanced && sections.slice(1).map(section => <ModuleSection key={section.title} section={section} isLoading={isLoading} canUseFeature={canUseFeature} theme={theme} openPlans={openPlans}/>) }
    <View style={styles.footer}>
      <AppButton mode="text" icon="cog-outline" onPress={() => router.push('/(settings)')}>Paramètres</AppButton>
      <AppButton mode="text" icon="lifebuoy" onPress={() => router.push('/support')}>Assistance</AppButton>
      <AppButton mode="text" destructive icon="logout" onPress={() => void signOut()}>Se déconnecter</AppButton>
    </View>
  </AdminPage>;
}

function ModuleSection({section,isLoading,canUseFeature,theme,openPlans}:{section:(typeof sections)[number];isLoading:boolean;canUseFeature:(feature:FeatureKey)=>boolean;theme:MD3Theme;openPlans:()=>void}) {
  return <View style={styles.section}><View><Text variant="titleLarge" style={styles.bold}>{section.title}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{section.subtitle}</Text></View><View style={styles.grid}>{section.items.map(([label, description, icon, path]) => {const gate=gatedModules[label];if (gate && (isLoading || !canUseFeature(gate.feature))) return null;return <Card key={label} mode="outlined" onPress={() => label==='Abonnement'?openPlans():router.push({pathname:path as never,params:{returnTo:'/more'}})} style={styles.card}><Card.Content style={styles.content}><View style={[styles.icon, { backgroundColor: theme.colors.secondaryContainer }]}><Icon source={icon} size={25} color={theme.colors.secondary}/></View><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{label}</Text><Text numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text></View><Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant}/></Card.Content></Card>})}</View></View>;
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14 }, bold: { fontWeight: '800' }, grow: { flex: 1, minWidth: 0 },
  section: { gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, card: { flexGrow: 1, flexBasis: 300, minWidth: 0 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
