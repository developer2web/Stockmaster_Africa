import { useLocalSearchParams } from 'expo-router';
import { ProductFormScreen } from '@/features/products/ProductFormScreen';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
export default function EmployeeProductDetails() { const { id } = useLocalSearchParams<{ id: string }>(); return <PermissionGuard permission="products.write"><ProductFormScreen id={id} basePath="/employee/products" /></PermissionGuard>; }
