import ReportsScreen from '@/features/reports/ReportsScreen';
import { RoleGuard } from '@/features/auth/RoleGuard';
export default function EmployeeReports(){return <RoleGuard roles={['employee']}><ReportsScreen/></RoleGuard>}
