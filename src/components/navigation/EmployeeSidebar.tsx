import { router, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Icon, Text, Tooltip, useTheme } from 'react-native-paper';
import { useAuth } from '@/features/auth/AuthProvider';
import { design } from '@/constants/design';
import { withLeaveGuard } from '@/components/ui/leaveGuard';
import { activeEmployeePath, employeePrimaryLinks, employeeToolLinks, type EmployeeLink } from './employeeLinks';

// Retour testeur du 26/09 : sur ordinateur uniquement, l'espace employé reprend le
// design de l'administrateur (AdminNavigation) — menu latéral à gauche, icônes et
// libellés, repliable. Sur téléphone, la barre d'icônes du bas reste inchangée.
function Item({ link, active, collapsed }: { link: EmployeeLink; active: boolean; collapsed: boolean }) {
  const theme = useTheme();
  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={link.label}
      accessibilityState={{ selected: active }}
      onPress={() => withLeaveGuard(() => router.navigate(link.path as never))}
      style={({ pressed }) => [styles.item, collapsed && styles.itemCollapsed, active && styles.activeItem, pressed && styles.pressed]}
    >
      <Icon source={link.icon} size={23} color={active ? design.colors.brand : theme.colors.onSurfaceVariant} />
      {!collapsed && <Text numberOfLines={1} style={[styles.itemText, active && { color: design.colors.brand }]}>{link.label}</Text>}
    </Pressable>
  );
  return collapsed ? <Tooltip title={link.label}>{content}</Tooltip> : content;
}

export function EmployeeSidebar() {
  const theme = useTheme();
  const pathname = usePathname();
  const { membership } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const account: EmployeeLink[] = [{ label: 'Paramètres', description: '', icon: 'cog-outline', path: '/employee/settings' }];
  const groups = [
    { label: 'Principal', links: employeePrimaryLinks(membership) },
    { label: 'Outils', links: employeeToolLinks(membership) },
    { label: 'Compte', links: account },
  ].filter(group => group.links.length);
  const active = activeEmployeePath(pathname, groups.flatMap(group => group.links.map(link => link.path)));

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.outlineVariant }]}>
      <View style={styles.brand}>
        <Image source={require('../../../assets/images/stockmaster-icon.png')} style={styles.logo} contentFit="cover" />
        {!collapsed && <View style={styles.brandCopy}>
          <Text variant="titleLarge" style={styles.brandTitle}>StockMaster</Text>
          <Text variant="bodySmall" numberOfLines={1}>{membership?.companyName}</Text>
          <Text variant="labelSmall" numberOfLines={1}>{membership?.storeName}</Text>
        </View>}
      </View>
      <Divider />
      <ScrollView style={styles.groups} contentContainerStyle={styles.groupsContent} showsVerticalScrollIndicator={false}>
        {groups.map(group => (
          <View key={group.label} style={styles.group}>
            {!collapsed && <Text variant="labelSmall" style={styles.groupLabel}>{group.label.toUpperCase()}</Text>}
            {group.links.map(link => <Item key={link.path} link={link} active={active === link.path} collapsed={collapsed} />)}
          </View>
        ))}
      </ScrollView>
      <Divider />
      <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? 'Déplier le menu' : 'Réduire le menu'} onPress={() => setCollapsed(value => !value)} style={[styles.item, collapsed && styles.itemCollapsed]}>
        <Icon source={collapsed ? 'chevron-double-right' : 'chevron-double-left'} size={21} />
        {!collapsed && <Text style={styles.itemText}>Réduire le menu</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 264, flexShrink: 0, padding: 14, borderRightWidth: 1, gap: 12 },
  sidebarCollapsed: { width: 78 },
  brand: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 46, height: 46, borderRadius: 14 },
  brandCopy: { flex: 1, minWidth: 0 },
  brandTitle: { fontWeight: '900', color: design.colors.brand },
  groups: { flex: 1 },
  groupsContent: { gap: 12, paddingBottom: 8 },
  group: { gap: 4 },
  groupLabel: { color: design.colors.muted, fontWeight: '800', paddingHorizontal: 12, marginBottom: 2 },
  item: { minHeight: 44, borderRadius: design.radius.small, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  activeItem: { backgroundColor: design.colors.brandSoft, borderLeftWidth: 3, borderLeftColor: design.colors.brand, paddingLeft: 9 },
  itemCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  itemText: { minWidth: 0, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
