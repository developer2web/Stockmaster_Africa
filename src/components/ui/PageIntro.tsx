import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function PageIntro({title,description,action}:{title:string;description?:string;action?:ReactNode}){const theme=useTheme();return <View style={styles.row}><View style={styles.copy}><Text variant="headlineSmall" style={styles.title}>{title}</Text>{description&&<Text style={{color:theme.colors.onSurfaceVariant}}>{description}</Text>}</View>{action&&<View style={styles.action}>{action}</View>}</View>}
const styles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12},copy:{flex:1,minWidth:220,gap:3},title:{fontWeight:'900'},action:{marginLeft:'auto'}});
