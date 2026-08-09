import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import { RoleGuard } from '@/features/auth/RoleGuard';

const BRAND = '#087F5B';

export default function Layout() {
  const theme = useTheme();
  return (
    <RoleGuard roles={['company_admin']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BRAND,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
          tabBarLabelStyle: { fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Accueil', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="sales"
          options={{ title: 'Ventes', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cart-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="stock"
          options={{ title: 'Stock', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="warehouse" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="cash"
          options={{ title: 'Caisse', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="wallet-outline" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="reports"
          options={{ title: 'Rapports', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-box-outline" color={color} size={size} /> }}
        />

        {/* Modules de gestion : accessibles via le menu, masqués de la barre d'onglets. */}
        <Tabs.Screen name="products" options={{ href: null }} />
        <Tabs.Screen name="customers" options={{ href: null }} />
        <Tabs.Screen name="categories" options={{ href: null }} />
        <Tabs.Screen name="suppliers" options={{ href: null }} />
        <Tabs.Screen name="stores" options={{ href: null }} />
        <Tabs.Screen name="employees" options={{ href: null }} />
        <Tabs.Screen name="roles" options={{ href: null }} />
        <Tabs.Screen name="company" options={{ href: null }} />
        <Tabs.Screen name="expenses" options={{ href: null }} />
        <Tabs.Screen name="scanner" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
