import { ProductFormScreen } from '@/features/products/ProductFormScreen';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
export default function EmployeeNewProduct() { return <PermissionGuard permission="products.write"><ProductFormScreen basePath="/employee/products" /></PermissionGuard>; }
