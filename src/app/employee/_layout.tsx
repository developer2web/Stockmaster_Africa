import { Stack, usePathname } from 'expo-router';
import { RoleGuard } from '@/features/auth/RoleGuard';

export default function EmployeeLayout() {
  const pathname = usePathname().replace(/\/+$/, '');
  const navigator = <Stack screenOptions={{ headerShown: false }} />;

  // /employee contient le formulaire public de connexion. Toutes ses sous-pages
  // restent protégées par le rôle employé.
  if (pathname === '/employee') return navigator;
  return <RoleGuard roles={['employee']}>{navigator}</RoleGuard>;
}
