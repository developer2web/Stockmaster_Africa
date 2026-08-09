import ExpensesScreen from '@/features/reports/ExpensesScreen';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';
import { RoleGuard } from '@/features/auth/RoleGuard';

export default function EmployeeExpenses() {
  return (
    <RoleGuard roles={['employee']}>
      <FeatureGate feature="expenses" label="Gestion des dépenses">
        <ExpensesScreen />
      </FeatureGate>
    </RoleGuard>
  );
}
