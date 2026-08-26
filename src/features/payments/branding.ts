import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCompany, getStoreReceiptBranding } from '@/features/employees/api';

export type ReceiptBranding = {
  company: string;
  store?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  footer?: string | null;
  accentColor: string;
  issuedBy?: string | null;
};

export function useReceiptBranding(storeName?: string | null, explicitStoreId?: string | null): ReceiptBranding {
  const { membership, session } = useAuth();
  const companyId = membership?.companyId ?? '';
  const storeId = explicitStoreId === null ? '' : (explicitStoreId ?? membership?.storeId ?? '');
  const company = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => getCompany(companyId),
    enabled: !!companyId,
  });
  const store = useQuery({
    queryKey: ['store-receipt-branding', companyId, storeId],
    queryFn: () => getStoreReceiptBranding(companyId, storeId),
    enabled: !!companyId && !!storeId,
  });
  const employeeName = String(session?.user.user_metadata?.full_name ?? '').trim();
  const storeSettings = store.data;
  return {
    company: company.data?.name ?? membership?.companyName ?? 'StockMaster',
    store: storeSettings?.receipt_display_name ?? storeName ?? storeSettings?.name ?? membership?.storeName,
    phone: storeSettings?.receipt_phone ?? company.data?.phone,
    email: storeSettings?.receipt_email ?? company.data?.email,
    address: storeSettings?.receipt_address ?? storeSettings?.address ?? company.data?.address,
    logoUrl: storeSettings?.receipt_logo_url ?? company.data?.logo_url,
    footer: storeSettings?.receipt_footer ?? company.data?.receipt_footer,
    accentColor: storeSettings?.receipt_accent_color ?? '#084B50',
    issuedBy: membership?.role === 'company_admin' ? 'Administrateur' : employeeName || 'Employé',
  };
}
