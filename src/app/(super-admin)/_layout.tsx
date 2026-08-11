import { Stack } from 'expo-router'; import { RoleGuard } from '@/features/auth/RoleGuard';
export default function Layout() { return <RoleGuard roles={['super_admin']} requireActiveSubscription={false}><Stack screenOptions={{ headerShown: false }} /></RoleGuard>; }
