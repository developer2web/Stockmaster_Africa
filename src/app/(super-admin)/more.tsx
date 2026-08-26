import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';

const sections = [
  { title: 'Plateforme', items: [
    ['Notifications', 'Tickets, paiements et alertes en temps réel', 'bell-badge-outline', '/(super-admin)/notifications'],
    ['Magasins', 'Tous les points de vente', 'store-cog-outline', '/(super-admin)/stores'],
    ['Centre opérationnel', 'Santé, support et incidents', 'heart-pulse', '/(super-admin)/operations'],
  ]},
  { title: 'Commercial', items: [
    ['Promotions', 'Codes promo et essais', 'ticket-percent-outline', '/(super-admin)/promotions'],
    ['Paiements', 'Orange Money et Stripe', 'credit-card-check-outline', '/(super-admin)/payments'],
  ]},
  { title: 'Contrôle', items: [
    ['Journal d’activité', 'Historique des actions sensibles', 'history', '/(super-admin)/audit'],
    ['Utilisateurs', 'Comptes, rôles et accès', 'account-cog-outline', '/(super-admin)/users'],
  ]},
] as const;

export default function SuperAdminMore() {
  const theme = useTheme();
  return <PlatformPage title="Tous les outils"><Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}><Card.Content style={styles.banner}><Icon source="shield-crown-outline" size={30} color={theme.colors.primary}/><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>Administration avancée</Text><Text>Les fonctions moins fréquentes sont regroupées ici pour garder l’accueil simple.</Text></View></Card.Content></Card>{sections.map(section => <View key={section.title} style={styles.section}><Text variant="titleLarge" style={styles.bold}>{section.title}</Text><View style={styles.grid}>{section.items.map(([label, description, icon, path]) => <Card key={label} mode="outlined" onPress={() => router.push(path as never)} style={styles.card}><Card.Content style={styles.row}><View style={[styles.icon,{backgroundColor:theme.colors.secondaryContainer}]}><Icon source={icon} size={25} color={theme.colors.secondary}/></View><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>{label}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{description}</Text></View><Icon source="chevron-right" size={22}/></Card.Content></Card>)}</View></View>)}</PlatformPage>;
}

const styles=StyleSheet.create({banner:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},bold:{fontWeight:'800'},section:{gap:10},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{flexGrow:1,flexBasis:'46%',minWidth:280},row:{flexDirection:'row',alignItems:'center',gap:12},icon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center'}});
