import { PropsWithChildren, useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';

export function AuthScreen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const compact = width < 400 || height < 700;
  const [drift] = useState(() => new Animated.Value(0));
  const [reveal] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const floating = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    floating.start();
    Animated.timing(reveal, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => floating.stop();
  }, [drift, reveal]);

  const orbOne = { transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }, { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '16deg'] }) }] };
  const orbTwo = { transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }, { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) }] };
  const card = { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: theme.dark ? '#06130F' : '#071A2F' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.backdrop} pointerEvents="none">
        <Animated.View style={[styles.orb, styles.orbOne, orbOne]} />
        <Animated.View style={[styles.orb, styles.orbTwo, orbTwo]} />
        <View style={styles.gridLineOne} />
        <View style={styles.gridLineTwo} />
      </View>
      <ScrollView contentContainerStyle={[styles.page, compact && styles.compactPage]} keyboardShouldPersistTaps="handled">
        <View style={[styles.brand, compact && styles.compactBrand]}>
          <View style={[styles.logoMark, compact && styles.compactLogoMark]}><Text style={[styles.logoLetter, compact && styles.compactLogoLetter]}>S</Text></View>
          <Text variant={compact ? 'headlineLarge' : 'displaySmall'} style={styles.logo}>StockMaster</Text>
          <Text variant="bodyLarge" style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Animated.View style={[styles.cardWrap, card]}>
          <Surface style={[styles.card, compact && styles.compactCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={4}>
            <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
            {children}
          </Surface>
        </Animated.View>
        <Text style={styles.caption}>Gestion intelligente • Simple • Sécurisée</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { position: 'absolute', inset: 0, overflow: 'hidden' },
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 30, minHeight: Platform.OS === 'web' ? 720 : undefined },
  compactPage: { justifyContent: 'flex-start', padding: 12, paddingVertical: 18, gap: 16, minHeight: undefined },
  brand: { alignItems: 'center', gap: 8 },
  compactBrand: { gap: 4 },
  logoMark: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#18C795', transform: [{ rotate: '-7deg' }], shadowColor: '#18C795', shadowOpacity: 0.45, shadowRadius: 20 },
  logoLetter: { color: '#06251D', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  compactLogoMark: { width: 44, height: 44, borderRadius: 14 },
  compactLogoLetter: { fontSize: 24, lineHeight: 30 },
  logo: { color: '#F5FFFC', fontWeight: '800', letterSpacing: -1.2 },
  subtitle: { color: '#B8D6CF', textAlign: 'center' },
  cardWrap: { width: '100%', maxWidth: 540, alignSelf: 'center' },
  card: { padding: 26, borderRadius: 28, gap: 15, borderWidth: 1 },
  compactCard: { padding: 16, borderRadius: 20, gap: 11 },
  title: { fontWeight: '700' },
  orb: { position: 'absolute', borderRadius: 999 },
  orbOne: { width: 340, height: 340, right: -100, top: -80, backgroundColor: 'rgba(24,199,149,0.22)', borderWidth: 1, borderColor: 'rgba(111,255,213,0.24)' },
  orbTwo: { width: 260, height: 260, left: -100, bottom: -50, backgroundColor: 'rgba(39,139,235,0.20)', borderWidth: 1, borderColor: 'rgba(115,187,255,0.24)' },
  gridLineOne: { position: 'absolute', width: 700, height: 1, left: -180, top: '32%', backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ rotate: '24deg' }] },
  gridLineTwo: { position: 'absolute', width: 700, height: 1, right: -200, bottom: '27%', backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ rotate: '-22deg' }] },
  caption: { color: '#7FA69C', textAlign: 'center', letterSpacing: 0.6 },
});
