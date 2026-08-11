import NewSale from '../../(admin)/sales/new';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { RoleGuard } from '@/features/auth/RoleGuard';
export default function EmployeeNewSale(){return <RoleGuard roles={['employee']}><PermissionGuard permission="sales.write"><NewSale/></PermissionGuard></RoleGuard>}
