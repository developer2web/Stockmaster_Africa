import SaleRefundScreen from '@/app/(admin)/sales/refund';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
export default function EmployeeSaleRefund(){return <PermissionGuard permission="sales.refund"><SaleRefundScreen/></PermissionGuard>}
