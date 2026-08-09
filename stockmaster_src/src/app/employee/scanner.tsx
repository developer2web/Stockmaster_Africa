import ScannerScreen from '../(admin)/scanner';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { RoleGuard } from '@/features/auth/RoleGuard';
export default function EmployeeScanner(){return <RoleGuard roles={['employee']}><PermissionGuard permission="sales.write"><ScannerScreen/></PermissionGuard></RoleGuard>}
