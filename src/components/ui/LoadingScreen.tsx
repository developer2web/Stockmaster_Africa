import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.skeletons}><View style={[styles.hero,{backgroundColor:theme.colors.surfaceVariant}]}/>{[1,2,3].map(item=><View key={item} style={[styles.line,{backgroundColor:theme.colors.surfaceVariant}]}/>)}</View>
      <Text style={{color:theme.colors.onSurfaceVariant}}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 260,
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletons:{width:'100%',maxWidth:520,gap:10},
  hero:{height:76,borderRadius:16,opacity:.7},
  line:{height:18,borderRadius:9,opacity:.55},
});
