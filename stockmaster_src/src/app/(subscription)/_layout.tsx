import { Stack } from 'expo-router'; import { RoleGuard } from '@/features/auth/RoleGuard';
export default function Layout() { return <RoleGuard roles={['company_admin', 'employee']} requireActiveSubscription={false}><Stack screenOptions={{ headerShown: false }} /></RoleGuard>; }
