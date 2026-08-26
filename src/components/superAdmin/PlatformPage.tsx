import { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Icon, Text, useTheme } from 'react-native-paper';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { PageIntro } from '@/components/ui/PageIntro';

const descriptions:Record<string,string>={Entreprises:'Recherchez, consultez et contrôlez les comptes clients.',Utilisateurs:'Contrôlez les utilisateurs et leurs accès à la plateforme.',Paiements:'Vérifiez les paiements et leur statut de traitement.','Offres et promotions':'Gérez les essais, abonnements et avantages commerciaux.','Journal d’activité':'Consultez les actions importantes par date et entreprise.','Tous les outils':'Accédez aux fonctions moins fréquentes de la plateforme.'};

export function PlatformPage({ title, description, back = true, action, children }: PropsWithChildren<{ title: string; description?: string; back?: boolean; action?: ReactNode }>) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const pathname=usePathname();
  const insets=useSafeAreaInsets();
  const compact = width < 600;
  const navigation=[
    {label:'Accueil',icon:'view-dashboard-outline',route:'/(super-admin)'},
    {label:'Entreprises',icon:'office-building-outline',route:'/(super-admin)/companies'},
    {label:'Utilisateurs',icon:'account-group-outline',route:'/(super-admin)/users'},
    {label:'Paiements',icon:'credit-card-outline',route:'/(super-admin)/payments'},
    {label:'Plus',icon:'dots-grid',route:'/(super-admin)/more'},
  ] as const;
  const primaryMobileRoute=compact&&navigation.some(item=>item.route==='/(super-admin)'?(pathname==='/'||pathname==='/(super-admin)'):pathname.includes(item.route.replace('/(super-admin)','')));
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={{ backgroundColor: theme.colors.surface }}>
        {back && !primaryMobileRoute && <AppBackButton fallback="/(super-admin)" />}
        <Appbar.Content title="Super Administration" subtitle={compact ? undefined : 'Compte connecté · Super Admin'} titleStyle={compact ? styles.compactTitle : undefined} />
      </Appbar.Header>
      <ScrollView nestedScrollEnabled contentContainerStyle={[styles.page, compact && styles.compactPage,compact&&{paddingBottom:92+insets.bottom}]} showsVerticalScrollIndicator={false}><PageIntro title={title} description={description??descriptions[title]??'Gérez cette partie de la plateforme.'} action={action}/>{children}</ScrollView>
      {compact&&<View style={[styles.bottomNav,{paddingBottom:Math.max(insets.bottom,6),backgroundColor:theme.colors.surface,borderTopColor:theme.colors.outlineVariant}]}>{navigation.map(item=>{const active=item.route==='/(super-admin)'?pathname==='/'||pathname==='/(super-admin)':pathname.includes(item.route.replace('/(super-admin)',''));return <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={()=>router.replace(item.route as never)} style={({pressed})=>[styles.navItem,pressed&&styles.pressed]}><Icon source={item.icon} size={23} color={active?theme.colors.primary:theme.colors.onSurfaceVariant}/><Text variant="labelSmall" numberOfLines={1} style={{color:active?theme.colors.primary:theme.colors.onSurfaceVariant,fontWeight:active?'800':'600'}}>{item.label}</Text></Pressable>})}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 20, paddingBottom: 44, gap: 18 },
  compactPage: { padding: 12, paddingBottom: 30, gap: 12 },
  compactTitle: { fontSize: 19, fontWeight: '800' },
  bottomNav:{position:'absolute',left:0,right:0,bottom:0,flexDirection:'row',borderTopWidth:1,paddingTop:7,paddingHorizontal:4},
  navItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:2,paddingVertical:4},
  pressed:{opacity:.65},
});
