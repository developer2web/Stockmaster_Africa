import { Icon, Snackbar, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { userErrorMessage } from '@/utils/errors';

// Couleurs volontairement figées (pas theme.colors.error/primary) : ce
// bandeau porte toujours du texte blanc par-dessus, et error/primary
// deviennent des teintes pastel CLAIRES en thème sombre (pensées pour du
// texte sur fond sombre, pas l'inverse) — texte blanc dessus devenait
// illisible en thème sombre (audit externe, SM-04 : "bandeau illisible").
const backgrounds = { error: '#BA1A1A', success: '#11643A', info: '#146C72' } as const;

export function AppFeedback({message,type='success',onDismiss,offsetBottom=0}:{message:string;type?:'success'|'error'|'info';onDismiss:()=>void;offsetBottom?:number}){const error=type==='error';const background=backgrounds[type];const safeMessage=error?userErrorMessage(message,'Impossible de terminer cette action. Réessayez.'):message;const displayed=type==='success'&&safeMessage&&!safeMessage.startsWith('✓')?`✓ ${safeMessage}`:safeMessage;return <Snackbar visible={!!message} duration={3200} onDismiss={onDismiss} style={[styles.snackbar,{backgroundColor:background},offsetBottom?{marginBottom:offsetBottom}:null]} wrapperStyle={offsetBottom?{bottom:offsetBottom}:undefined}><View style={styles.row}>{type!=='success'&&<Icon source={error?'alert-circle-outline':'information-outline'} size={20} color="#FFFFFF"/>}<Text style={styles.text}>{displayed}</Text></View></Snackbar>}
const styles=StyleSheet.create({snackbar:{borderRadius:12,width:'100%',maxWidth:430,alignSelf:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},text:{color:'#FFFFFF',fontWeight:'800',flex:1}});
