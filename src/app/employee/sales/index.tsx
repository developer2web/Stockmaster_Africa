import SalesScreen from '../../(admin)/sales/index';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { RoleGuard } from '@/features/auth/RoleGuard';
export default function EmployeeSales(){return <RoleGuard roles={['employee']}><PermissionGuard permission={['sales.read','sales.write']}><SalesScreen/></PermissionGuard></RoleGuard>}
