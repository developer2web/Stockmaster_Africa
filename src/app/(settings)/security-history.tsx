import { useQuery } from '@tanstack/react-query';
import { Card,HelperText,Icon,Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSecurityEvents } from '@/features/account/security';
const labels:Record<string,string>={login:'Connexion',mfa_enabled:'2FA activée',mfa_disabled:'2FA désactivée',global_logout:'Déconnexion globale'};
export default function SecurityHistory(){const query=useQuery({queryKey:['security-events'],queryFn:getSecurityEvents});return <AdminPage title="Journal de sécurité">{!!query.error&&<HelperText type="error" visible>{query.error.message}</HelperText>}{query.data?.map(event=><Card key={event.id} mode="outlined"><Card.Content style={{flexDirection:'row',alignItems:'center',gap:12}}><Icon source={event.event_type==='login'?'login':'shield-check-outline'} size={26}/><Text style={{flex:1}}><Text variant="titleMedium">{labels[event.event_type]??event.event_type}</Text>{'\n'}{event.device_label??'Appareil inconnu'} • {new Date(event.created_at).toLocaleString('fr-FR')}</Text></Card.Content></Card>)}{!query.isLoading&&!query.data?.length&&<EmptyState icon="shield-search" title="Aucun événement" message="Les prochaines connexions seront enregistrées ici."/>}</AdminPage>}
