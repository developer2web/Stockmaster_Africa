import { FeatureGate } from '@/components/subscriptions/FeatureGate';
import ExpensesScreen from '@/features/reports/ExpensesScreen';

export default function ExpensesRoute() {
  return (
    <FeatureGate feature="expenses" label="Gestion des dépenses">
      <ExpensesScreen />
    </FeatureGate>
  );
}
