import { View } from 'react-native'; import { Icon, Text } from 'react-native-paper';
export function EmptyState({ icon='inbox-outline', title, message }:{icon?:string;title:string;message:string}) { return <View style={{alignItems:'center',padding:36,gap:8}}><Icon source={icon} size={42}/><Text variant="titleMedium">{title}</Text><Text style={{textAlign:'center'}}>{message}</Text></View>; }
