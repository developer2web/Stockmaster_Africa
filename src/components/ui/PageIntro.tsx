import { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function PageIntro({title,description,action}:{title:string;description?:string;action?:ReactNode}){const theme=useTheme();const{width}=useWindowDimensions();const compact=width<620;return <View style={[styles.row,compact&&styles.compactRow]}><View style={styles.copy}><Text variant="headlineSmall" style={[styles.title,compact&&styles.compactTitle]}>{title}</Text>{description&&<Text numberOfLines={compact?2:3} style={[styles.description,{color:theme.colors.onSurfaceVariant}]}>{description}</Text>}</View>{action&&<View style={[styles.action,compact&&styles.compactAction]}>{action}</View>}</View>}
const styles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12},compactRow:{alignItems:'stretch',gap:10},copy:{flex:1,minWidth:220,gap:3},title:{fontWeight:'900'},compactTitle:{fontSize:23,lineHeight:29},description:{fontSize:14,lineHeight:20},action:{marginLeft:'auto'},compactAction:{width:'100%',marginLeft:0,alignItems:'stretch'}});
