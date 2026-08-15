import SaleRefundScreen from '../../(admin)/sales/refund';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
export default function EmployeeSaleRefund(){return <PermissionGuard permission="sales.write"><SaleRefundScreen/></PermissionGuard>}
