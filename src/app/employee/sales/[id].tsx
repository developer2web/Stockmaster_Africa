import SaleDetails from '../../(admin)/sales/[id]';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { RoleGuard } from '@/features/auth/RoleGuard';
export default function EmployeeSaleDetails(){return <RoleGuard roles={['employee']}><PermissionGuard permission="sales.read"><SaleDetails/></PermissionGuard></RoleGuard>}
