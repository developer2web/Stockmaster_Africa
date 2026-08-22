export type EmployeeAccessSnapshot = {
  store_id: string | null;
  membership_stores?: Array<{ store_id: string }> | null;
};

export function employeeStoreIds(employee: EmployeeAccessSnapshot) {
  return [...new Set([
    ...(employee.membership_stores ?? []).map(item => item.store_id),
    ...(employee.store_id ? [employee.store_id] : []),
  ].filter(Boolean))];
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
