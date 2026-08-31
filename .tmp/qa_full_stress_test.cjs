/* StockMaster remote QA stress test. Data is isolated to the QA RLS company. */
require('dotenv').config();

const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const PROJECT_REF = 'mwpbinlxablzruvpjjjy';
const QA_COMPANY = 'QA RLS 20260831-3aab0d';
const ADMIN_EMAIL = 'stockmaster.africa+rls-admin-20260831-3aab0d@gmail.com';
const ADMIN_PASSWORD = 'Sm!RlsAdmin-2026#A9';
const EMPLOYEE_EMAIL = 'stockmaster.africa+rls-employee-20260831-3aab0d@gmail.com';
const EMPLOYEE_PASSWORD = 'Sm!RlsEmployee-2026#E7';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) throw new Error('Configuration Supabase absente');

const keys = JSON.parse(execFileSync(
  'cmd.exe',
  ['/d', '/s', '/c', `npx.cmd supabase projects api-keys --project-ref ${PROJECT_REF} --output json`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
));
const serviceKey = keys.find((item) => item.name === 'service_role')?.api_key;
if (!serviceKey) throw new Error('Clé service_role indisponible');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const employee = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const createdSaleIds = [];

function progress(message) { console.log(`[QA] ${message}`); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function today(offset = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function check(name, action) {
  try {
    const detail = await action();
    results.push({ name, status: 'PASS', detail: detail ?? '' });
    return detail;
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
    return null;
  }
}

async function expectError(name, action, pattern) {
  return check(name, async () => {
    try {
      await action();
    } catch (error) {
      if (pattern && !pattern.test(error.message)) throw new Error(`Erreur inattendue: ${error.message}`);
      return error.message;
    }
    throw new Error('L’opération interdite a été acceptée');
  });
}

async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(error?.message || 'Connexion refusée');
  return data.user;
}

async function ensureRows(client, table, names, makeRow, companyId, storeId) {
  const { data: existing, error: readError } = await client.from(table).select('id,name').eq('company_id', companyId).eq('store_id', storeId).in('name', names);
  if (readError) throw new Error(`${table}: ${readError.message}`);
  const found = new Map((existing || []).map((row) => [row.name, row]));
  const missing = names.filter((name) => !found.has(name)).map((name, index) => makeRow(name, index));
  if (missing.length) {
    const { data, error } = await client.from(table).insert(missing).select('id,name');
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data || []) found.set(row.name, row);
  }
  return names.map((name) => found.get(name)).filter(Boolean);
}

async function main() {
  progress('Connexion des comptes QA');
  const adminUser = await signIn(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  const employeeUser = await signIn(employee, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  const businesses = await rpc(admin, 'get_accessible_businesses', {});
  const business = businesses.find((item) => item.company_name === QA_COMPANY);
  assert(business, 'Entreprise QA introuvable pour l’Admin');
  const stores = await rpc(admin, 'get_accessible_stores', { p_company_id: business.company_id });
  assert(stores.length === 1, `Une boutique QA attendue, reçu: ${stores.length}`);
  const companyId = business.company_id;
  const storeId = stores[0].store_id;

  await check('Admin authentifié et espace accessible', async () => `${business.company_name} / ${stores[0].store_name}`);
  await check('Employé authentifié et espace accessible', async () => {
    const employeeBusinesses = await rpc(employee, 'get_accessible_businesses', {});
    assert(employeeBusinesses.length === 1 && employeeBusinesses[0].company_id === companyId, 'Entreprise Employé incorrecte');
    const employeeStores = await rpc(employee, 'get_accessible_stores', { p_company_id: companyId });
    assert(employeeStores.length === 1 && employeeStores[0].store_id === storeId, 'Boutique Employé incorrecte');
    return '1 entreprise / 1 boutique';
  });

  progress('Création des catégories, fournisseurs et clients');
  const categoryNames = [
    'Démo · Boissons', 'Démo · Épicerie', 'Démo · Produits laitiers', 'Démo · Hygiène', 'Démo · Entretien',
    'Démo · Snacks', 'Démo · Céréales', 'Démo · Conserves', 'Démo · Surgelés', 'Démo · Boulangerie',
  ];
  const categories = await ensureRows(admin, 'categories', categoryNames, (name) => ({
    company_id: companyId, store_id: storeId, name, description: 'Catégorie de démonstration QA', is_active: true,
  }), companyId, storeId);

  const supplierNames = Array.from({ length: 12 }, (_, index) => `Démo · Fournisseur ${String(index + 1).padStart(2, '0')}`);
  const suppliers = await ensureRows(admin, 'suppliers', supplierNames, (name, index) => ({
    company_id: companyId, store_id: storeId, name, email: `fournisseur${index + 1}@demo.stockmaster.app`,
    phone: `+22462010${String(index + 1).padStart(4, '0')}`, address: `Conakry, secteur ${index + 1}`, is_active: true,
  }), companyId, storeId);

  const customerNames = Array.from({ length: 30 }, (_, index) => `Démo · Client ${String(index + 1).padStart(2, '0')}`);
  const customers = await ensureRows(admin, 'customers', customerNames, (name, index) => ({
    company_id: companyId, store_id: storeId, name, email: `client${index + 1}@demo.stockmaster.app`,
    phone: `+22462120${String(index + 1).padStart(4, '0')}`, address: `Conakry, quartier ${index + 1}`,
    note: index % 3 === 0 ? 'Client fidèle de démonstration' : null,
    credit_limit: index === 0 ? 100000 : 5000000, is_active: true,
  }), companyId, storeId);
  progress(`${categories.length} catégories, ${suppliers.length} fournisseurs, ${customers.length} clients disponibles`);

  const productNames = [
    'Eau minérale 1,5 L','Jus mangue 1 L','Jus orange 1 L','Soda cola 33 cl','Boisson énergisante','Lait chocolaté',
    'Riz premium 5 kg','Huile végétale 1 L','Sucre blanc 1 kg','Farine de blé 1 kg','Sel iodé 500 g','Pâtes alimentaires 500 g',
    'Lait en poudre 400 g','Yaourt nature','Beurre doux 250 g','Fromage portions','Lait concentré','Crème dessert',
    'Savon de toilette','Dentifrice familial','Shampooing 400 ml','Papier hygiénique','Déodorant','Brosse à dents',
    'Lessive en poudre 1 kg','Liquide vaisselle','Eau de javel 1 L','Nettoyant sol','Éponge cuisine','Sac poubelle',
    'Biscuits chocolat','Chips salées','Bonbons assortis','Cacahuètes grillées','Barre céréalière','Popcorn',
    'Flocons d’avoine','Corn flakes','Bouillie enrichie','Couscous de maïs','Mil précuit','Granola',
    'Tomates pelées','Sardines à l’huile','Thon en conserve','Haricots rouges','Maïs doux','Petits pois',
    'Poulet entier surgelé','Poisson surgelé','Frites surgelées','Légumes mélangés','Glace vanille','Viande hachée',
    'Pain baguette','Pain complet','Croissant','Cake marbré','Brioche','Beignet sucré',
  ];

  progress('Création et approvisionnement de 60 produits');
  const skus = productNames.map((_, index) => `DEMO-${String(index + 1).padStart(3, '0')}`);
  const { data: existingProducts, error: existingProductsError } = await admin.from('products')
    .select('id,name,sku,barcode,purchase_price,sale_price').eq('company_id', companyId).eq('store_id', storeId).in('sku', skus);
  if (existingProductsError) throw existingProductsError;
  const existingBySku = new Map((existingProducts || []).map((row) => [row.sku, row]));
  for (let index = 0; index < productNames.length; index += 1) {
    if (existingBySku.has(skus[index])) continue;
    const purchasePrice = 5000 + index * 750;
    const salePrice = Math.ceil((purchasePrice * (1.3 + (index % 4) * 0.05)) / 500) * 500;
    const productId = await rpc(admin, 'create_product_with_initial_stock', {
      p_store_id: storeId,
      p_name: `Démo · ${productNames[index]}`,
      p_description: `Produit de démonstration ${index + 1} pour les tests StockMaster`,
      p_sku: skus[index],
      p_barcode: `2900000000${String(index + 1).padStart(3, '0')}`,
      p_category_id: categories[Math.floor(index / 6)].id,
      p_supplier_id: suppliers[index % suppliers.length].id,
      p_unit: ['piece', 'carton', 'kg', 'litre', 'sac', 'paquet'][index % 6],
      p_purchase_price: purchasePrice,
      p_sale_price: salePrice,
      p_low_stock_threshold: 10 + (index % 8),
      p_is_active: true,
      p_initial_quantity: 180 + index * 3,
      p_operation_id: randomUUID(),
    });
    existingBySku.set(skus[index], { id: productId, name: productNames[index], sku: skus[index], purchase_price: purchasePrice, sale_price: salePrice });
    if ((index + 1) % 10 === 0) progress(`${index + 1}/60 produits traités`);
  }
  const { data: products, error: productsError } = await admin.from('products')
    .select('id,name,sku,barcode,purchase_price,sale_price').eq('company_id', companyId).eq('store_id', storeId).in('sku', skus).order('sku');
  if (productsError) throw productsError;
  assert(products.length === 60, `60 produits attendus, reçu: ${products.length}`);

  await check('Pagination produits page 1', async () => {
    const { data, error } = await admin.from('products').select('id').eq('company_id', companyId).eq('store_id', storeId).order('created_at').range(0, 29);
    if (error) throw error; assert(data.length === 30, `${data.length} lignes`); return '30 produits';
  });
  await check('Pagination produits page 2', async () => {
    const { data, error } = await admin.from('products').select('id').eq('company_id', companyId).eq('store_id', storeId).order('created_at').range(30, 59);
    if (error) throw error; assert(data.length === 30, `${data.length} lignes`); return '30 produits';
  });
  await check('Recherche instantanée par nom', async () => {
    const { data, error } = await admin.from('products').select('id,name').eq('company_id', companyId).eq('store_id', storeId).ilike('name', '%Riz premium%');
    if (error) throw error; assert(data.length >= 1, 'Produit non trouvé'); return data[0].name;
  });
  await check('Recherche exacte par code-barres', async () => {
    const { data, error } = await admin.from('products').select('id,name').eq('company_id', companyId).eq('store_id', storeId).eq('barcode', '2900000000001');
    if (error) throw error; assert(data.length === 1, `${data.length} résultat(s)`); return data[0].name;
  });

  const cashStatus = await rpc(admin, 'get_store_cash_session_status', { p_store_id: storeId });
  const status = Array.isArray(cashStatus) ? cashStatus[0] : cashStatus;
  if (status?.requires_opening) {
    await rpc(admin, 'open_store_cash', {
      p_store_id: storeId, p_counted_amount: Number(status.expected_initial || 0), p_note: 'Réouverture automatique pour tests QA',
    });
  }
  const { count: demoFundCount, error: demoFundError } = await admin.from('cash_transactions')
    .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id', storeId)
    .eq('designation', 'Fonds de démonstration QA');
  if (demoFundError) throw demoFundError;
  if (!demoFundCount) {
    await rpc(admin, 'record_cash_transaction', {
      p_store_id: storeId, p_transaction_type: 'deposit', p_designation: 'Fonds de démonstration QA',
      p_amount: 100000000, p_operation_id: randomUUID(),
    });
  }

  progress('Création de 12 approvisionnements fournisseurs');
  const { count: existingPurchaseCount, error: purchaseCountError } = await admin.from('purchases')
    .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id', storeId);
  if (purchaseCountError) throw purchaseCountError;
  for (let index = existingPurchaseCount || 0; index < 12; index += 1) {
    await rpc(admin, 'record_purchase', {
      p_store_id: storeId,
      p_supplier_id: suppliers[index].id,
      p_items: [0, 1, 2].map((offset) => {
        const product = products[(index * 3 + offset) % products.length];
        return { productId: product.id, quantity: 20 + offset * 5, unitCost: Number(product.purchase_price) };
      }),
      p_paid: index < 6,
      p_operation_id: randomUUID(),
    });
  }

  progress('Création de 90 ventes réparties sur 15 jours');
  const { count: existingSaleCount, error: saleCountError } = await admin.from('sales')
    .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id', storeId);
  if (saleCountError) throw saleCountError;
  for (let index = existingSaleCount || 0; index < 90; index += 1) {
    const lines = Array.from({ length: 1 + (index % 4) }, (_, offset) => {
      const product = products[(index * 5 + offset * 7) % products.length];
      return {
        productId: product.id,
        variantId: null,
        quantity: 1 + ((index + offset) % 4),
        discount: index % 11 === 0 ? 500 : 0,
        unitPrice: Number(product.sale_price),
      };
    });
    const estimate = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity - line.discount, 0);
    const creditMode = index % 6 === 0;
    const partialMode = index % 6 === 1;
    const customer = (creditMode || partialMode) ? customers[1 + (index % (customers.length - 1))] : null;
    const response = await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId,
      p_payment_method: creditMode ? 'credit' : partialMode ? 'partial' : index % 3 === 0 ? 'mobile_money' : 'cash',
      p_items: lines,
      p_customer_id: customer?.id || null,
      p_amount_paid: creditMode ? 0 : partialMode ? Math.floor(estimate / 2) : null,
      p_operation_id: randomUUID(),
      p_offline_created_at: null,
      p_offline_device_id: null,
    });
    const row = Array.isArray(response) ? response[0] : response;
    assert(row?.sale_id, `Vente ${index + 1} non créée`);
    createdSaleIds.push(row.sale_id);
    if ((index + 1) % 15 === 0) progress(`${index + 1}/90 ventes créées`);
  }

  progress('Répartition historique des ventes pour alimenter les graphiques');
  for (let day = 0; day < 15; day += 1) {
    const ids = createdSaleIds.filter((_, index) => index % 15 === day);
    const stamp = new Date(Date.now() - day * 86400000 - (day % 5) * 3600000).toISOString();
    const { error } = await service.from('sales').update({ created_at: stamp }).in('id', ids);
    if (error) throw error;
  }

  progress('Création de 20 ventes à crédit ou paiement partiel');
  const { count: existingLedgerCount, error: ledgerCountError } = await admin.from('customer_ledger')
    .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('entry_type', 'credit');
  if (ledgerCountError) throw ledgerCountError;
  for (let index = existingLedgerCount || 0; index < 20; index += 1) {
    const product = products[(index * 3 + 1) % products.length];
    const isPartial = index % 2 === 1;
    const unitPrice = Number(product.sale_price);
    await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId,
      p_payment_method: isPartial ? 'partial' : 'credit',
      p_items: [{ productId: product.id, variantId: null, quantity: 2, discount: 0, unitPrice }],
      p_customer_id: customers[1 + (index % (customers.length - 1))].id,
      p_amount_paid: isPartial ? unitPrice : 0,
      p_operation_id: randomUUID(), p_offline_created_at: null, p_offline_device_id: null,
    });
  }

  progress('Création de 20 dépenses');
  const expenseLabels = ['Transport', 'Électricité', 'Internet', 'Nettoyage', 'Maintenance', 'Fournitures', 'Livraison', 'Réparation'];
  const { count: existingExpenseCount, error: expenseCountError } = await admin.from('expenses')
    .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id', storeId);
  if (expenseCountError) throw expenseCountError;
  for (let index = existingExpenseCount || 0; index < 20; index += 1) {
    await rpc(admin, 'record_expense', {
      p_store_id: storeId,
      p_label: `Démo · ${expenseLabels[index % expenseLabels.length]} ${index + 1}`,
      p_amount: 25000 + index * 5000,
      p_expense_date: today(-(index % 15)),
      p_operation_id: randomUUID(),
    });
  }

  await check('Règlement partiel d’une dette client', async () => {
    const { data, error } = await admin.from('customer_balances').select('customer_id,balance').eq('company_id', companyId).gt('balance', 0).order('balance', { ascending: false }).limit(1);
    if (error) throw error; assert(data.length, 'Aucune dette client créée');
    const amount = Math.max(1, Math.floor(Number(data[0].balance) / 3));
    const id = await rpc(admin, 'record_customer_entry_v2', {
      p_customer_id: data[0].customer_id, p_store_id: storeId, p_entry_type: 'payment', p_amount: amount,
      p_payment_method: 'cash', p_note: 'Règlement partiel QA', p_sale_id: null, p_operation_id: randomUUID(),
    });
    return `paiement ${amount} GNF / écriture ${id}`;
  });

  await check('Règlement partiel d’une dette fournisseur', async () => {
    const { count: existingPaymentCount, error: existingPaymentError } = await admin.from('supplier_payments')
      .select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id', storeId);
    if (existingPaymentError) throw existingPaymentError;
    if (existingPaymentCount) return `${existingPaymentCount} règlement(s) déjà visible(s)`;
    const { data, error } = await admin.from('purchases').select('supplier_id,amount_due').eq('company_id', companyId).eq('store_id', storeId).gt('amount_due', 0).order('amount_due', { ascending: false }).limit(1);
    if (error) throw error; assert(data.length, 'Aucune dette fournisseur créée');
    const amount = Math.max(1, Math.floor(Number(data[0].amount_due) / 2));
    const id = await rpc(admin, 'record_supplier_payment', {
      p_store_id: storeId, p_supplier_id: data[0].supplier_id, p_amount: amount,
      p_payment_method: 'cash', p_note: 'Règlement partiel QA', p_operation_id: randomUUID(),
    });
    return `paiement ${amount} GNF / opération ${id}`;
  });

  await check('Idempotence d’une vente (double-clic)', async () => {
    const operationId = randomUUID();
    const args = {
      p_store_id: storeId, p_payment_method: 'cash',
      p_items: [{ productId: products[0].id, variantId: null, quantity: 1, discount: 0, unitPrice: Number(products[0].sale_price) }],
      p_customer_id: null, p_amount_paid: null, p_operation_id: operationId,
      p_offline_created_at: null, p_offline_device_id: null,
    };
    const first = await rpc(admin, 'create_sale_v3', args);
    const second = await rpc(admin, 'create_sale_v3', args);
    const firstId = (Array.isArray(first) ? first[0] : first).sale_id;
    const secondId = (Array.isArray(second) ? second[0] : second).sale_id;
    assert(firstId === secondId, 'Deux ventes différentes ont été créées');
    return firstId;
  });

  await check('Synchronisation d’une vente hors ligne valide', async () => {
    const response = await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId, p_payment_method: 'cash',
      p_items: [{ productId: products[2].id, variantId: null, quantity: 1, discount: 0, unitPrice: Number(products[2].sale_price) }],
      p_customer_id: null, p_amount_paid: null, p_operation_id: randomUUID(),
      p_offline_created_at: new Date(Date.now() - 60000).toISOString(), p_offline_device_id: 'qa-device-20260831',
    });
    return (Array.isArray(response) ? response[0] : response).reference;
  });

  await expectError('Refus d’une vente avec stock insuffisant', async () => {
    await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId, p_payment_method: 'cash',
      p_items: [{ productId: products[0].id, variantId: null, quantity: 99999999, discount: 0, unitPrice: Number(products[0].sale_price) }],
      p_customer_id: null, p_amount_paid: null, p_operation_id: randomUUID(), p_offline_created_at: null, p_offline_device_id: null,
    });
  }, /stock|quantit/i);

  await expectError('Refus d’une vente à crédit sans client', async () => {
    await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId, p_payment_method: 'credit',
      p_items: [{ productId: products[1].id, variantId: null, quantity: 1, discount: 0, unitPrice: Number(products[1].sale_price) }],
      p_customer_id: null, p_amount_paid: 0, p_operation_id: randomUUID(), p_offline_created_at: null, p_offline_device_id: null,
    });
  }, /client|dette/i);

  await expectError('Refus d’un horodatage hors ligne futur', async () => {
    await rpc(admin, 'create_sale_v3', {
      p_store_id: storeId, p_payment_method: 'cash',
      p_items: [{ productId: products[3].id, variantId: null, quantity: 1, discount: 0, unitPrice: Number(products[3].sale_price) }],
      p_customer_id: null, p_amount_paid: null, p_operation_id: randomUUID(),
      p_offline_created_at: new Date(Date.now() + 10 * 60000).toISOString(), p_offline_device_id: 'qa-device-20260831',
    });
  }, /heure|invalide/i);

  await expectError('Refus d’un SKU en doublon', async () => {
    await rpc(admin, 'create_product_with_initial_stock', {
      p_store_id: storeId, p_name: 'Démo · Doublon interdit', p_description: 'Test doublon', p_sku: products[0].sku,
      p_barcode: '2999999999999', p_category_id: categories[0].id, p_supplier_id: suppliers[0].id,
      p_unit: 'piece', p_purchase_price: 1000, p_sale_price: 1500, p_low_stock_threshold: 1,
      p_is_active: true, p_initial_quantity: 1, p_operation_id: randomUUID(),
    });
  }, /duplicate|unique|existe/i);

  await check('Employé bloqué sur la modification de l’entreprise', async () => {
    const { data, error } = await employee.from('companies').update({ name: 'Modification interdite' }).eq('id', companyId).select('id');
    if (error) return `refus SQL: ${error.message}`;
    assert((data || []).length === 0, 'Une entreprise a été modifiée');
    return '0 ligne modifiée par RLS';
  });

  await check('Employé limité à sa boutique', async () => {
    const { data, error } = await employee.from('products').select('id,store_id').eq('company_id', companyId).limit(1000);
    if (error) throw error;
    assert(data.length >= 60, `Seulement ${data.length} produits visibles`);
    assert(data.every((row) => row.store_id === storeId), 'Produit d’une autre boutique visible');
    return `${data.length} produits autorisés`;
  });

  await check('Employé ne voit ni abonnement ni paiement plateforme', async () => {
    const [subscriptions, payments, audits] = await Promise.all([
      employee.from('subscriptions').select('id').limit(10),
      employee.from('payment_transactions').select('id').limit(10),
      employee.from('audit_logs').select('id').limit(10),
    ]);
    for (const result of [subscriptions, payments, audits]) {
      if (result.error) throw result.error;
      assert((result.data || []).length === 0, 'Données administratives visibles');
    }
    return '0 abonnement / 0 paiement / 0 journal';
  });

  await check('Comportement Vente Employé conforme aux permissions', async () => {
    const context = await rpc(employee, 'get_workspace_context', { p_company_id: companyId, p_store_id: storeId });
    const row = Array.isArray(context) ? context[0] : context;
    const canSell = (row?.permissions || []).includes('sales.write');
    const response = await employee.rpc('create_sale_v3', {
      p_store_id: storeId, p_payment_method: 'cash',
      p_items: [{ productId: products[4].id, variantId: null, quantity: 1, discount: 0, unitPrice: Number(products[4].sale_price) }],
      p_customer_id: null, p_amount_paid: null, p_operation_id: randomUUID(), p_offline_created_at: null, p_offline_device_id: null,
    });
    if (canSell) {
      if (response.error) throw response.error;
      return 'Vente autorisée conformément au rôle';
    }
    assert(response.error, 'Vente acceptée sans permission sales.write');
    return 'Vente refusée conformément au rôle';
  });

  await check('Isolation anonyme RLS', async () => {
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const table of ['companies', 'stores', 'products', 'sales', 'customers', 'suppliers', 'audit_logs']) {
      const { data, error } = await anonymous.from(table).select('id').limit(5);
      if (error) throw error;
      assert((data || []).length === 0, `${table}: données anonymes visibles`);
    }
    return '7 tables protégées';
  });

  await check('Rapport financier alimenté', async () => {
    const report = await rpc(admin, 'get_business_report', {
      p_start_date: today(-30), p_end_date: today(0), p_store_id: storeId,
      p_employee_id: null, p_product_id: null, p_category_id: null,
    });
    assert(Number(report.revenue || 0) > 0, 'Chiffre d’affaires nul');
    assert(Number(report.saleCount || 0) >= 90, `Seulement ${report.saleCount || 0} ventes`);
    assert(Array.isArray(report.topProducts) && report.topProducts.length > 0, 'Classement produits vide');
    return `CA ${Number(report.revenue).toLocaleString('fr-FR')} GNF / ${report.saleCount} ventes / ${report.topProducts.length} produits classés`;
  });

  await check('Filtres de rapports alimentés', async () => {
    const filters = await rpc(admin, 'get_report_filters', { p_store_id: storeId });
    assert((filters.products || []).length >= 60, 'Produits absents des filtres');
    assert((filters.categories || []).length >= 10, 'Catégories absentes des filtres');
    return `${filters.products.length} produits / ${filters.categories.length} catégories / ${filters.employees.length} employés`;
  });

  await check('Historique des ventes paginé', async () => {
    const first = await rpc(admin, 'get_sales_history_safe', { p_company_id: companyId, p_store_id: storeId, p_offset: 0, p_limit: 30 });
    const second = await rpc(admin, 'get_sales_history_safe', { p_company_id: companyId, p_store_id: storeId, p_offset: 30, p_limit: 30 });
    assert(first.length === 30 && second.length === 30, `${first.length}/${second.length}`);
    const overlap = new Set(first.map((row) => row.id));
    assert(second.every((row) => !overlap.has(row.id)), 'Doublon entre les pages');
    return '30 + 30 lignes sans chevauchement';
  });

  progress('Clôture et réouverture contrôlées de la caisse');
  await check('Clôture personnalisée puis reprise de caisse', async () => {
    const { data: opening, error: openingError } = await service.from('cash_openings').select('counted_amount,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (openingError) throw openingError;
    let txQuery = service.from('cash_transactions').select('transaction_type,amount').eq('company_id', companyId).eq('store_id', storeId);
    if (opening?.created_at) txQuery = txQuery.gt('created_at', opening.created_at);
    const { data: transactions, error: txError } = await txQuery;
    if (txError) throw txError;
    const expected = Number(opening?.counted_amount || 0) + (transactions || []).reduce((sum, row) => sum + (row.transaction_type === 'deposit' ? Number(row.amount) : -Number(row.amount)), 0);
    const counted = Math.max(0, expected);
    const closureId = await rpc(admin, 'close_store_cash', {
      p_store_id: storeId, p_counted_amount: counted, p_note: expected < 0 ? 'Écart justifié par les opérations de démonstration QA' : 'Clôture complète de démonstration QA',
    });
    await rpc(admin, 'open_store_cash', { p_store_id: storeId, p_counted_amount: counted, p_note: 'Reprise après clôture QA' });
    return `clôture ${closureId} / reprise ${counted.toLocaleString('fr-FR')} GNF`;
  });

  const tableNames = ['categories','products','suppliers','customers','sales','sale_items','expenses','purchases','stock_movements','customer_ledger','supplier_payments','cash_transactions','cash_closures','audit_logs'];
  const counts = {};
  for (const table of tableNames) {
    const { count, error } = await service.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[table] = count || 0;
  }

  await admin.auth.signOut();
  await employee.auth.signOut();
  const passed = results.filter((item) => item.status === 'PASS').length;
  const failed = results.filter((item) => item.status === 'FAIL').length;
  console.log('\n=== STOCKMASTER QA FINAL ===');
  console.log(JSON.stringify({ company: QA_COMPANY, passed, failed, counts, results }, null, 2));
  if (failed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
