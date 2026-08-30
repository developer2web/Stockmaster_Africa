import { Children, ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

/** Keeps forms compact on larger screens and readable on phones. */
export function ResponsiveFormGrid({ children, minColumnWidth = 260 }: { children: ReactNode; minColumnWidth?: number }) {
  const { width } = useWindowDimensions();
  const singleColumn = width < 720;
  return (
    <View style={styles.grid}>
      {Children.map(children, (child) => (
        <View style={singleColumn ? styles.single : [styles.column, { minWidth: minColumnWidth }]}>{child}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  column: { flexGrow: 1, flexBasis: '46%' },
  single: { width: '100%' },
});
