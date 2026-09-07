import { Children, ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/** Base columns on the containing card, including when a sidebar is open. */
export function ResponsiveFormGrid({ children, minColumnWidth = 260 }: { children: ReactNode; minColumnWidth?: number }) {
  const [width, setWidth] = useState(0);
  const singleColumn = width < minColumnWidth * 2 + 12;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.grid}>
    {Children.map(children, child => child ? <View style={singleColumn ? styles.single : styles.column}>{child}</View> : null)}
  </View>;
}
const styles = StyleSheet.create({
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  column: { minWidth: 0, flexGrow: 1, flexBasis: '46%' },
  single: { minWidth: 0, width: '100%' },
});
