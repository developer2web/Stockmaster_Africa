import { Icon, Snackbar, Text, useTheme } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { userErrorMessage } from '@/utils/errors';

export function AppFeedback({message,type='success',onDismiss}:{message:string;type?:'success'|'error'|'info';onDismiss:()=>void}){const theme=useTheme();const error=type==='error';const background=error?theme.colors.error:type==='success'?'#11643A':theme.colors.primary;const safeMessage=error?userErrorMessage(message,'Impossible de terminer cette action. Réessayez.'):message;const displayed=type==='success'&&safeMessage&&!safeMessage.startsWith('✓')?`✓ ${safeMessage}`:safeMessage;return <Snackbar visible={!!message} duration={3200} onDismiss={onDismiss} style={[styles.snackbar,{backgroundColor:background}]}><View style={styles.row}>{type!=='success'&&<Icon source={error?'alert-circle-outline':'information-outline'} size={20} color="#FFFFFF"/>}<Text style={styles.text}>{displayed}</Text></View></Snackbar>}
const styles=StyleSheet.create({snackbar:{borderRadius:12,width:'100%',maxWidth:430,alignSelf:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},text:{color:'#FFFFFF',fontWeight:'800',flex:1}});
