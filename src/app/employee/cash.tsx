import CashScreen from '../(admin)/cash';
import { PermissionGuard } from '@/features/auth/PermissionGuard';

export default function EmployeeCash() {
  return <PermissionGuard permission={['cash_transactions.read', 'expenses.read']}><CashScreen /></PermissionGuard>;
}
