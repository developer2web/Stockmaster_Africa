export type AppRole = 'super_admin' | 'company_admin' | 'employee';
export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'
  | 'cancelled'
  | 'expired';

export interface MembershipContext {
  membershipId: string | null;
  companyId: string | null;
  companyName: string;
  storeId: string | null;
  storeName?: string | null;
  role: AppRole;
  roleName: string;
  permissions: string[];
  subscriptionStatus: SubscriptionStatus | null;
  countryCode: string;
  countryName: string;
  defaultCurrencyCode: string;
  secondaryCurrencyCode: string | null;
  currencyLockedAt: string | null;
}

export interface BusinessAccess {
  companyId: string;
  companyName: string;
  membershipId: string;
  role: AppRole;
  roleName: string;
  subscriptionStatus: SubscriptionStatus | null;
  countryCode: string;
  countryName: string;
  defaultCurrencyCode: string;
  secondaryCurrencyCode: string | null;
  currencyLockedAt: string | null;
}
export interface StoreAccess { storeId: string; storeName: string; address: string | null }
export type WorkspaceContext = MembershipContext & { companyId: string; storeId: string; storeName: string };

export interface Store {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  receipt_display_name: string | null;
  receipt_address: string | null;
  receipt_phone: string | null;
  receipt_email: string | null;
  receipt_logo_url: string | null;
  receipt_footer: string | null;
  receipt_accent_color: string;
  created_at: string;
}
export interface Permission { id: string; code: string; description: string | null }
export interface EmployeeRole { id: string; company_id: string; name: string; code: AppRole; permissions: string[] }
export interface Employee { id: string; userId: string; fullName: string; roleId: string; roleName: string; storeId: string | null; storeName: string | null; storeIds: string[]; storeNames: string[]; allStores: boolean; isActive: boolean; createdAt: string }
export interface Category { id:string; company_id:string; store_id:string; name:string; description:string|null; is_active:boolean; created_at:string }
export interface Supplier { id:string; company_id:string; store_id:string; name:string; email:string|null; phone:string|null; address:string|null; is_active:boolean; created_at:string }
export interface ProductVariant { id:string; product_id:string; name:string; sku:string; barcode:string|null; attributes:Record<string,string>; purchase_price:number|null; sale_price:number|null; is_active:boolean }
export type ProductUnit = 'piece'|'carton'|'kg'|'litre'|'sac'|'paquet';
export interface Product { id:string; company_id:string; store_id:string; category_id:string|null; supplier_id:string|null; name:string; description:string|null; sku:string; qr_code:string; barcode:string|null; unit:ProductUnit; purchase_price:number; sale_price:number; low_stock_threshold:number; image_url:string|null; image_urls:string[]; is_active:boolean; created_at:string; category?:{name:string}|null; supplier?:{name:string}|null; product_variants?:ProductVariant[] }
export interface StockLevel { id:string; company_id:string; store_id:string; product_id:string; product_variant_id:string|null; quantity:number; updated_at:string; store?:{name:string}|null; product?:{name:string;sku:string;purchase_price?:number;sale_price?:number}|null; variant?:{name:string;sku:string}|null }
export interface StockMovement { id:string; company_id:string; store_id:string|null; product_id:string; product_variant_id:string|null; quantity:number; previous_quantity:number|null; new_quantity:number|null; movement_type:string; note:string|null; created_at:string; store?:{name:string}|null; product?:{name:string;sku:string}|null; variant?:{name:string;sku:string}|null }
export interface Sale { id:string; company_id:string; store_id:string|null; customer_id:string|null; reference:string|null; subtotal:number; discount_total:number; tax_rate_snapshot:number; tax_total:number; total:number; amount_paid:number; amount_due:number; payment_status:'paid'|'partial'|'credit'; cost_total:number; gross_profit:number; currency_code:string; secondary_currency_code:string|null; secondary_exchange_rate:number|null; exchange_rate_effective_at:string|null; payment_method:string|null; created_by:string|null; created_at:string; store?:{id?:string;name:string}|null; creator?:{full_name:string}|null; customer?:{name:string;phone:string|null;email:string|null}|null; sale_items?:SaleItem[] }
export interface SaleItem { id:string; sale_id:string; product_id:string; product_variant_id:string|null; purchase_price_snapshot:number; sale_price:number; quantity:number; discount:number; tax_rate_snapshot:number; tax_amount:number; gross_profit:number; line_total:number; product?:{name:string;sku:string}|null; variant?:{name:string;sku:string}|null }
export interface SaleStockItem { stockLevelId:string; productId:string; variantId:string|null; categoryId:string|null; categoryName:string|null; unit:ProductUnit; name:string; sku:string; salePrice:number; purchasePrice:number; available:number; imageUrl:string|null }
export interface ReportMetricRow { id?:string; name:string; revenue?:number; gross_profit?:number; quantity?:number; amount?:number; count?:number; sales?:number }
export interface BusinessReport {
  startDate:string; endDate:string; revenue:number; costOfGoods:number; grossProfit:number; expenses:number; netProfit:number;
  quantitySold:number; saleCount:number; stockValue:number;
  previous:{revenue:number;grossProfit:number;expenses:number;netProfit:number};
  topProducts:ReportMetricRow[]; paymentMethods:ReportMetricRow[]; stores:ReportMetricRow[]; employees:ReportMetricRow[];
}
export interface ReportFilterOption { id:string; name:string }
export interface ReportFilters { stores:ReportFilterOption[]; employees:ReportFilterOption[]; products:ReportFilterOption[]; categories:ReportFilterOption[] }
export interface Expense { id:string; company_id:string; store_id:string|null; label:string; amount:number; currency_code:string; secondary_currency_code:string|null; secondary_exchange_rate:number|null; exchange_rate_effective_at:string|null; expense_date:string; created_at:string; store?:{name:string}|null }
