import { EmailConfiguration } from './EmailConfiguration';
import { WebSessionGate } from '../../shared/WebSessionGate';
import { formatBillingMoney, planDisplayName, subscriptionStatusLabel } from '../../../src/constants/commercial';
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { changeWebPassword, configured, getContext, signIn, supabase, type UserContext } from '../../shared/supabase';
import './reference-exact.css';
import './stability.css';
import './actions-fix.css';
import './premium-admin.css';
import '../../shared/ux.css';
import './super-admin-layout.css';
import './admin-structure.css';
import { AdminSidebar, AdminMobileHeader, pageDescriptions, type AdminView as View } from './AdminNavigation';

type Stats = { companies: number; active_companies: number; stores: number; users: number; sales: number; subscriptions: Record<string, number>; revenue_by_currency: { currency_code: string; revenue: number }[]; monthly_sales: { month: string; currency_code: string; revenue: number; sales: number }[] };
type Company = { id: string; name: string; slug: string | null; is_active: boolean; store_count: number; user_count: number; sale_count: number; revenue: number; currency_code: string; subscription_status: string | null; plan_code: string | null; subscription_starts_at: string | null; subscription_expires_at: string | null; trial_ends_at: string | null };
type User = { membership_id: string; email: string; full_name: string; company_name: string; store_name: string | null; role_name: string; is_active: boolean; created_at: string };
type Payment = { id: string; company_name: string; client_email: string; plan_name: string; amount: number; currency: string; provider: string; provider_reference: string | null; proof_path: string | null; status: string; created_at: string; failure_reason: string | null; archived_at: string | null; archive_reason: string | null };
type Promotion = { id: string; name: string; code: string | null; promotion_type: string; value: number; expires_at: string; is_active: boolean };
type Ticket = { id: string; subject: string; description: string; priority: string; status: string; resolution: string | null; created_at: string; company: { name: string } | null };
type Audit = { id: string; action: string; entity_type: string; created_at: string; company: { name: string } | null; actor: { full_name: string } | null };
type ErrorEvent = { id: string; severity: 'warning'|'error'|'fatal'; code: string; message: string; context: Record<string,unknown>; platform: string|null; app_version: string|null; created_at: string; resolved_at: string|null; resolution_note: string|null; company: { name:string }|null; user: { full_name:string }|null };
type PlatformWarning = { warning_key:string; warning_type:string; severity:'info'|'warning'|'critical'; title:string; detail:string; company_ids:string[]; company_names:string[]; occurrence_count:number; detected_at:string; status:'open'|'ignored'|'resolved'; note:string|null };
type EmailDeliverySummary = { status:string; total:number; last_event_at:string|null; last_error:string|null };
type SettingsTab = 'Général' | 'Paiements' | 'Abonnements' | 'Emails / API' | 'Sécurité';
type Settings = { orange_money_number: string; orange_money_account_name: string; trial_days: number; grace_period_days: number; trial_enabled: boolean };
type SubscriptionLifecycle = { company_id: string; status: string; starts_at: string | null; expires_at: string | null; current_period_ends_at: string | null; trial_ends_at: string | null; created_at: string };
type Run = (action: () => PromiseLike<{ error: unknown }>, message: string) => Promise<boolean>;
type CatalogPlan = { code: string; name: string };
const PlanCatalogContext = React.createContext<CatalogPlan[]>([]);
function usePlanCatalog() { const plans = React.useContext(PlanCatalogContext); return { plans, planName: (code: string | null) => planDisplayName(code, plans.find(plan => plan.code === code)?.name) }; }


const normalizeCurrency = (currency?: string | null) => (currency || 'GNF').toUpperCase() === 'FG' ? 'GNF' : (currency || 'GNF').toUpperCase();
const currencyLabel = (currency: string) => ({ GNF: 'FG — Franc guinéen', USD: 'USD — Dollar américain', EUR: 'EUR — Euro', CAD: 'CAD — Dollar canadien', XOF: 'XOF — Franc CFA' } as Record<string, string>)[normalizeCurrency(currency)] ?? normalizeCurrency(currency);
const money = formatBillingMoney;
const day = (value: string) => new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value));
const errorMessage = (value: unknown) => {const raw=value instanceof Error?value.message:typeof value==='object'&&value!==null&&'message'in value?String(value.message):'';if(/failed to fetch|network/i.test(raw))return 'Connexion au serveur impossible. Vérifiez Internet puis réessayez.';if(/permission|row-level security|forbidden/i.test(raw))return 'Vous n’avez pas l’autorisation d’effectuer cette action.';if(/duplicate|unique|already exists/i.test(raw))return 'Cette information existe déjà.';return raw||'Opération impossible.'};

async function loadBillingPayments() {
  const current = await supabase.rpc('super_admin_billing_payments_v2');
  if (!current.error) return current;
  if (!/super_admin_billing_payments_v2|schema cache|could not find/i.test(current.error.message)) return current;
  const legacy = await supabase.rpc('super_admin_billing_payments');
  return legacy.error ? legacy : { ...legacy, data: (legacy.data ?? []).map((payment: Record<string, unknown>) => ({ ...payment, archived_at: null, archive_reason: null })) };
}

async function toggleCompanyAccess(company: Company, run: Run) {
  let reason: string | null = null;
  if (company.is_active) {
    reason = window.prompt(`Raison obligatoire de la suspension de ${company.name} :`)?.trim() ?? null;
    if (!reason || reason.length < 3) return;
  } else if (!window.confirm(`Réactiver ${company.name} ?`)) return;
  await run(() => supabase.rpc('set_company_active', {
    p_company_id: company.id,
    p_active: !company.is_active,
    p_reason: reason,
  }), company.is_active ? 'Entreprise suspendue et motif enregistré.' : 'Entreprise réactivée.');
}

function Login({ ready }: { ready: (context: UserContext) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await signIn(email, password); const context = await getContext(); if (!context || context.role !== 'super_admin') { await supabase.auth.signOut(); throw new Error('Accès réservé au Super Admin.'); } ready(context); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); } }
  return <main className="loginScreen"><form className="loginCard" onSubmit={submit}><img src="/stockmaster-icon.png" alt="StockMaster"/><small>ADMINISTRATION SÉCURISÉE</small><h1>StockMaster Admin</h1><p>Connectez-vous au centre de contrôle.</p>{!configured && <div className="alert danger">Configuration Supabase absente.</div>}<label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required/></label><label>Mot de passe<input type="password" value={password} onChange={event => setPassword(event.target.value)} required/></label>{error && <div className="alert danger">{error}</div>}<button className="primary" disabled={busy || !configured}>{busy ? 'Vérification…' : 'Se connecter'}</button></form></main>;
}

function App() {
  const [context, setContext] = useState<UserContext | null>(null); const [opening, setOpening] = useState(true); const [view, setView] = useState<View>('Vue générale'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [selected, setSelected] = useState<Company | null>(null);
  const [stats, setStats] = useState<Stats | null>(null); const [companies, setCompanies] = useState<Company[]>([]); const [users, setUsers] = useState<User[]>([]); const [payments, setPayments] = useState<Payment[]>([]); const [promotions, setPromotions] = useState<Promotion[]>([]); const [tickets, setTickets] = useState<Ticket[]>([]); const [audit, setAudit] = useState<Audit[]>([]); const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('Général');
  const [unavailableViews, setUnavailableViews] = useState<View[]>([]);
  const [planCatalog, setPlanCatalog] = useState<CatalogPlan[]>([]);
  const [errors, setErrors] = useState<ErrorEvent[]>([]); const [warnings, setWarnings] = useState<PlatformWarning[]>([]); const [emailSummary, setEmailSummary] = useState<EmailDeliverySummary[]>([]);
  useEffect(() => { supabase.auth.getSession().then(async ({ data }) => { if (data.session) { const current = await getContext().catch(() => null); if (current?.role === 'super_admin') setContext(current); } setOpening(false); }); }, []);
  const load = useCallback(async () => {
    if (!context) return;
    setBusy(true); setError('');
    try {
      const [s, c, u, p, pr, t, a, b, subscriptions, e, w, em, catalog] = await Promise.all([
        supabase.rpc('super_admin_dashboard'),
        supabase.rpc('super_admin_companies'),
        supabase.rpc('super_admin_users'),
        loadBillingPayments(),
        supabase.from('promotions').select('id,name,code,promotion_type,value,expires_at,is_active').order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('id,subject,description,priority,status,resolution,created_at,company:companies(name)').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('id,action,entity_type,created_at,company:companies(name),actor:profiles!audit_logs_actor_id_fkey(full_name)').order('created_at', { ascending: false }).limit(150),
        supabase.from('billing_settings').select('orange_money_number,orange_money_account_name,trial_days,grace_period_days,trial_enabled').eq('id', true).single(),
        supabase.from('subscriptions').select('company_id,status,starts_at,expires_at,current_period_ends_at,trial_ends_at,created_at').order('created_at', { ascending: false }),
        supabase.from('app_error_events').select('id,severity,code,message,context,platform,app_version,created_at,resolved_at,resolution_note,company:companies(name),user:profiles!app_error_events_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(500),
        supabase.rpc('super_admin_platform_warnings'),
        supabase.rpc('super_admin_email_delivery_summary'),
        supabase.from('plans').select('code,name').eq('is_active', true).order('monthly_price'),
      ]);
      for (const result of [s, c, u, p, subscriptions, catalog, b]) if (result.error) throw result.error;
      const latestByCompany = new Map<string, SubscriptionLifecycle>();
      for (const subscription of (subscriptions.data ?? []) as SubscriptionLifecycle[]) if (!latestByCompany.has(subscription.company_id)) latestByCompany.set(subscription.company_id, subscription);
      const mergedCompanies = ((c.data ?? []) as Company[]).map(company => {
        const lifecycle = latestByCompany.get(company.id);
        return {
          ...company,
          subscription_status: company.subscription_status ?? lifecycle?.status ?? null,
          subscription_starts_at: company.subscription_starts_at ?? lifecycle?.starts_at ?? null,
          subscription_expires_at: company.subscription_expires_at ?? lifecycle?.current_period_ends_at ?? lifecycle?.expires_at ?? lifecycle?.trial_ends_at ?? null,
          trial_ends_at: company.trial_ends_at ?? lifecycle?.trial_ends_at ?? null,
        };
      });
      setPlanCatalog((catalog.data ?? []) as CatalogPlan[]);
      setStats(s.data as Stats); setCompanies(mergedCompanies); setUsers((u.data ?? []) as User[]); setPayments((p.data ?? []) as Payment[]);
      if (!pr.error) setPromotions((pr.data ?? []) as Promotion[]);
      if (!t.error) setTickets((t.data ?? []) as unknown as Ticket[]);
      if (!a.error) setAudit((a.data ?? []) as unknown as Audit[]);
      if (!b.error && b.data) setSettings(b.data as Settings);
      if (!e.error) setErrors((e.data ?? []) as unknown as ErrorEvent[]);
      if (!w.error) setWarnings((w.data ?? []) as PlatformWarning[]);
      if (!em.error) setEmailSummary((em.data ?? []) as EmailDeliverySummary[]);
      const failures: [View, unknown][] = [['Promotions', pr.error], ['Support', t.error], ['Activité', a.error], ['Erreurs', e.error], ['Avertissements', w.error || em.error]];
      const missingSections = failures.filter(([, failure]) => failure).map(([section]) => section);
      setUnavailableViews(missingSections);
      if(missingSections.length) setError(`Chargement incomplet : ${missingSections.join(', ')}. Vérifiez les migrations du serveur puis actualisez.`);
    } catch (caught) {
      setUnavailableViews(Object.keys(pageDescriptions) as View[]);
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }, [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!context) return;
    const channel = supabase.channel(`super-admin-live:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
        setNotice('Nouveau ticket d’assistance reçu.');
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, () => { void load(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_error_events' }, () => { setNotice('Une nouvelle erreur applicative a été enregistrée.'); void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [context, load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener('stockmaster:refresh', refresh); return () => window.removeEventListener('stockmaster:refresh', refresh); }, [load]);
  useEffect(() => { const openPromotions = () => changeView('Promotions'); window.addEventListener('stockmaster:open-promotions', openPromotions); return () => window.removeEventListener('stockmaster:open-promotions', openPromotions); }, []);
  async function run(action: () => PromiseLike<{ error: unknown }>, success: string) { if(busy)return false;setBusy(true); setError(''); setNotice(''); try { const result = await action(); if (result.error) throw result.error; setNotice(`✓ ${success.replace(/^✓\s*/, '').replace(/\.$/,'')}`); await load(); return true; } catch (caught) { setError(errorMessage(caught)); return false; } finally { setBusy(false); } }
  async function proof(payment: Payment) { if (!payment.proof_path) { setError('Aucun justificatif joint à ce paiement.'); return; } const popup = window.open('about:blank', '_blank'); const result = await supabase.storage.from('payment-proofs').createSignedUrl(payment.proof_path, 300); if (result.error) { popup?.close(); setError(result.error.message); return; } if (popup) popup.location.href = result.data.signedUrl; else window.location.assign(result.data.signedUrl); }
  async function logout() { await supabase.auth.signOut(); setContext(null); }
  function changeView(next: View) { setView(next); setSearch(''); setStatus('all'); setNotice(''); setSettingsTab('Général'); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function configureTrials() { changeView('Paramètres'); setSettingsTab('Abonnements'); }
  const term = search.toLowerCase().trim(); const shownCompanies = companies.filter(company => (!term || company.name.toLowerCase().includes(term)) && (status === 'all' || (status === 'active') === company.is_active)); const shownUsers = users.filter(user => !term || `${user.full_name} ${user.email} ${user.company_name}`.toLowerCase().includes(term)); const shownPayments = payments.filter(payment => (!term || `${payment.company_name} ${payment.provider_reference ?? ''}`.toLowerCase().includes(term)) && (status === 'all' || (status === 'processing' ? payment.status === 'processing' || payment.status === 'pending' : payment.status === status)));
  if (opening) return <div className="loading">Ouverture de StockMaster…</div>; if (!context) return <Login ready={setContext}/>;
  const counts: Partial<Record<View, number>> = {};
  if (stats && !unavailableViews.includes('Paiements')) counts.Paiements = payments.filter(payment => !payment.archived_at && ['pending', 'processing'].includes(payment.status)).length;
  if (stats && !unavailableViews.includes('Support')) counts.Support = tickets.filter(ticket => ['open', 'in_progress'].includes(ticket.status)).length;
  if (stats && !unavailableViews.includes('Erreurs')) counts.Erreurs = errors.filter(item => !item.resolved_at).length;
  if (stats && !unavailableViews.includes('Avertissements')) counts.Avertissements = warnings.filter(item => item.status === 'open').length;
  const navigation = { view, onNavigate: changeView, onLogout: () => void logout(), counts };
  return <PlanCatalogContext.Provider value={planCatalog}>
    <div className="adminApp">
      <AdminSidebar {...navigation}/>
      <main className="content">
        <AdminMobileHeader {...navigation}/>
        {busy && <div className="alert" role="status">Actualisation en cours…</div>}
        {error && <div className="alert danger" role="alert">{error}</div>}
        {notice && <div className="alert success" role="status">{notice}</div>}
        {view === 'Vue générale' && <Dashboard stats={stats} payments={payments} companies={companies} audit={audit} counts={counts} unavailableViews={unavailableViews} go={changeView}/>}
        {view === 'Entreprises' && <Companies data={shownCompanies} search={search} setSearch={setSearch} status={status} setStatus={setStatus} open={setSelected} run={run}/>}
        {view === 'Utilisateurs' && <Users data={shownUsers} search={search} setSearch={setSearch} run={run}/>}
        {view === 'Abonnements' && <Subscriptions companies={companies} stats={stats} run={run} configureTrials={configureTrials}/>}
        {view === 'Paiements' && <Payments data={shownPayments} search={search} setSearch={setSearch} status={status} setStatus={setStatus} run={run} proof={proof}/>}
        {view === 'Promotions' && <Promotions data={promotions} run={run}/>}
        {view === 'Support' && <Support data={tickets} run={run}/>}
        {view === 'Erreurs' && <ErrorsPage data={errors} run={run}/>}
        {view === 'Avertissements' && <WarningsPage data={warnings} emailSummary={emailSummary} run={run}/>}
        {view === 'Activité' && <Activity data={audit}/>}
        {view === 'Paramètres' && (settings ? <SettingsPage value={settings} setValue={setSettings} run={run} initialTab={settingsTab}/> : <p>Les paramètres sont indisponibles. Actualisez pour les charger.</p>)}
      </main>
      {selected && <CompanyDetails company={selected} close={() => setSelected(null)} run={run}/>}
    </div>
  </PlanCatalogContext.Provider>;
}

function Title({ children, action, description }: { children: React.ReactNode; action?: React.ReactNode; description?: string }) {
  const subtitle = description ?? pageDescriptions[String(children) as View];
  return <div className="pageTitle"><div><span className="pageEyebrow">SUPER ADMIN</span><h1>{children}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="titleActions"><button className="refreshBtn" onClick={() => window.dispatchEvent(new Event('stockmaster:refresh'))} aria-label="Actualiser les données"><span aria-hidden="true">↻</span> Actualiser</button>{action}</div></div>;
}
function Kpi({ label, value, note, warning }: { label: string; value: string | number; note: string; warning?: boolean }) { const symbol = label.includes('Revenu') ? '↗' : label.includes('Paiement') ? '✓' : label.includes('Abonnement') ? '◆' : label.includes('Entreprise') ? '▦' : '•'; return <article className="kpi"><div className="kpiTop"><span>{label}</span><i>{symbol}</i></div><strong className={warning ? 'warn' : ''}>{value}</strong><small>{note}</small><div className="kpiGlow"/></article>; }
const htmlSafe = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
function openPdfReport(title: string, subtitle: string, summary: string, headers: string[], rows: (string | number)[][]) { const popup = window.open('', '_blank', 'width=980,height=900'); if (!popup) return; const table = rows.map(row => `<tr>${row.map(cell => `<td>${htmlSafe(cell)}</td>`).join('')}</tr>`).join(''); popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${htmlSafe(title)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#183b35;font-size:11px}.head{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:3px solid #08735f}.brand{display:flex;align-items:center;gap:12px}.brand img{width:48px;height:48px;border-radius:11px}.brand b{display:block;color:#07584e;font-size:22px}.brand span,.meta{color:#71837f}.meta{text-align:right;font-size:9px}h1{margin:24px 0 5px;font-size:22px}h2{margin:0;color:#71837f;font-size:11px;font-weight:normal}.summary{margin:20px 0;padding:17px;border-radius:12px;background:#edf8f3;border-left:4px solid #0a896c;font-size:14px;font-weight:bold;white-space:pre-line}table{width:100%;border-collapse:collapse}th{padding:10px 8px;background:#073f43;color:#fff;text-align:left;font-size:9px;text-transform:uppercase}td{padding:9px 8px;border-bottom:1px solid #dde9e5}tr:nth-child(even) td{background:#f8fbfa}.foot{margin-top:25px;padding-top:12px;border-top:1px solid #dce8e4;color:#71837f;text-align:center;font-size:9px}.print{display:block;margin:20px auto 0;padding:10px 16px;border:0;border-radius:8px;background:#08735f;color:#fff;font-weight:bold}@media print{.print{display:none}}</style></head><body><header class="head"><div class="brand"><img src="${location.origin}/stockmaster-icon.png"><div><b>StockMaster</b><span>Super Administration</span></div></div><div class="meta">Rapport officiel<br>Généré le ${htmlSafe(new Date().toLocaleString('fr-FR'))}</div></header><h1>${htmlSafe(title)}</h1><h2>${htmlSafe(subtitle)}</h2><div class="summary">${htmlSafe(summary)}</div><table><thead><tr>${headers.map(header => `<th>${htmlSafe(header)}</th>`).join('')}</tr></thead><tbody>${table || `<tr><td colspan="${headers.length}">Aucune donnée disponible.</td></tr>`}</tbody></table><p class="foot">StockMaster · Rapport confidentiel de la plateforme</p><button class="print" id="receipt-print">Enregistrer en PDF</button></body></html>`); popup.document.close(); popup.document.getElementById('receipt-print')?.addEventListener('click', () => popup.print()); }
function ValidatedRevenue({ payments }: { payments: Payment[] }) { const [period, setPeriod] = useState<'today' | 'month' | 'all'>('month'); const now = new Date(); const validated = payments.filter(payment => { if (payment.status !== 'succeeded') return false; const created = new Date(payment.created_at); if (period === 'today') return created.toDateString() === now.toDateString(); if (period === 'month') return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear(); return true; }); const totals = validated.reduce<Record<string, number>>((result, payment) => { const currency = payment.currency || 'GNF'; result[currency] = (result[currency] ?? 0) + Number(payment.amount); return result; }, {}); const periodLabel = period === 'today' ? 'Aujourd’hui' : period === 'month' ? 'Ce mois' : 'Depuis le début'; function exportRevenuePdf() { const summary = Object.entries(totals).map(([currency, total]) => `${currency} : ${money(total, currency)}`).join('\n'); openPdfReport('Rapport du chiffre d’affaires', `${periodLabel} · Paiements validés uniquement`, `${summary}\n${validated.length} paiement${validated.length > 1 ? 's' : ''} validé${validated.length > 1 ? 's' : ''}`, ['Date', 'Entreprise', 'Méthode', 'Référence', 'Montant'], validated.map(payment => [new Date(payment.created_at).toLocaleString('fr-FR'), payment.company_name, payment.provider === 'stripe' ? 'Carte bancaire' : 'Orange Money', payment.provider_reference ?? '—', money(payment.amount, payment.currency)])); } return <section className="validatedRevenue"><div className="revenueHeader"><div className="revenueIcon">↗</div><div className="revenueCopy"><span>CHIFFRE D’AFFAIRES ENCAISSÉ</span><h2>Revenus des paiements validés</h2><p>Les paiements en attente ou refusés ne sont jamais comptabilisés.</p></div></div><div className="revenuePeriod"><button className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')}>Aujourd’hui</button><button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Ce mois</button><button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>Depuis le début</button></div><div className="revenueTotals">{Object.entries(totals).length ? Object.entries(totals).map(([currency, total]) => <div key={currency}><small>TOTAL EN {currency}</small><strong>{money(total, currency)}</strong></div>) : <div><small>AUCUN PAIEMENT VALIDÉ</small><strong>{money(0, 'GNF')}</strong></div>}<em>{validated.length} paiement{validated.length > 1 ? 's' : ''} validé{validated.length > 1 ? 's' : ''}</em></div><button className="revenueExport" onClick={exportRevenuePdf} disabled={!validated.length}>Rapport PDF</button></section>; }
function Toolbar({ search, setSearch, children }: { search: string; setSearch: (value: string) => void; children?: React.ReactNode }) { return <div className="toolbar"><div className="searchBox"><span>⌕</span><input aria-label="Rechercher" placeholder="Rechercher dans la liste…" value={search} onChange={event => setSearch(event.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Effacer la recherche">×</button>}</div>{children}</div>; }
function exportDashboard(stats: Stats | null) { openPdfReport('Rapport général de la plateforme', 'Vue globale StockMaster', `Entreprises actives : ${stats?.active_companies ?? 0}\nVentes enregistrées : ${stats?.sales ?? 0}`, ['Indicateur', 'Valeur'], [['Entreprises', stats?.companies ?? 0], ['Entreprises actives', stats?.active_companies ?? 0], ['Magasins', stats?.stores ?? 0], ['Utilisateurs', stats?.users ?? 0], ['Ventes', stats?.sales ?? 0]]); }

function Dashboard({ stats, payments, companies, audit, counts, unavailableViews, go }: { stats: Stats | null; payments: Payment[]; companies: Company[]; audit: Audit[]; counts: Partial<Record<View, number>>; unavailableViews: View[]; go: (view: View) => void }) {
  const [currency, setCurrency] = useState('GNF');
  const monthlySales = stats?.monthly_sales ?? [];
  const currencies = Array.from(new Set(monthlySales.map(month => normalizeCurrency(month.currency_code)))).sort();
  const selectedCurrency = currencies.includes(currency) ? currency : currencies[0] ?? 'GNF';
  const months = monthlySales.filter(month => normalizeCurrency(month.currency_code) === selectedCurrency).sort((a, b) => a.month.localeCompare(b.month));
  const priorities: { view: View; label: string; note: string }[] = [
    { view: 'Paiements', label: 'Paiements à vérifier', note: 'Déclarations et opérations en attente' },
    { view: 'Support', label: 'Demandes de support', note: 'Tickets ouverts ou en cours' },
    { view: 'Erreurs', label: 'Erreurs à examiner', note: 'Non résolues parmi les 500 derniers incidents' },
  ];
  const available = !!stats && !unavailableViews.includes('Vue générale');
  return <>
    <Title>Vue générale</Title>
    <div className="sectionHeading"><div><h2>À traiter</h2></div></div>
    <div className="homePriorities">{priorities.map(item => <button key={item.view} className={`priorityCard ${(counts[item.view] ?? 0) > 0 ? 'needsAttention' : ''}`} onClick={() => go(item.view)}>
      <strong>{counts[item.view] ?? '—'}</strong><span><b>{item.label}</b><small>{unavailableViews.includes(item.view) ? 'Données indisponibles · actualisez pour réessayer' : item.note}</small></span><em aria-hidden="true">→</em>
    </button>)}</div>
    <div className="sectionHeading"><div><h2>Votre plateforme</h2></div><button className="textButton" onClick={() => go('Entreprises')}>Voir les entreprises →</button></div>
    <div className="kpis homeKpis">
      <Kpi label="Entreprises actives" value={available ? stats.active_companies : '—'} note={available ? `${stats.companies} entreprises au total` : 'Données non disponibles'}/>
      <Kpi label="Abonnements actifs" value={available ? stats.subscriptions?.active ?? 0 : '—'} note="Forfaits en cours"/>
      <Kpi label="Utilisateurs" value={available ? stats.users : '—'} note={available ? `${stats.stores} boutiques enregistrées` : 'Données non disponibles'}/>
    </div>
    <details className="homeDetails">
      <summary>Encaissements et abonnements <small>Revenus StockMaster et répartition des forfaits</small></summary>
      <div className="homeDetailsBody">
        {available && !unavailableViews.includes('Paiements') ? <ValidatedRevenue payments={payments}/> : <p>Les encaissements ne sont pas disponibles. Actualisez pour les charger.</p>}
        <section className="panel"><div className="panelHead"><h2>Répartition des abonnements</h2><button className="textButton" onClick={() => go('Abonnements')}>Gérer</button></div>
          <dl className="subscriptionFigures">{available && Object.entries(stats.subscriptions ?? {}).map(([status, total]) => <div key={status}><dt>{subscriptionStatusLabel(status)}</dt><dd>{total}</dd></div>)}</dl>
          {available && !Object.keys(stats.subscriptions ?? {}).length && <p>Aucun abonnement enregistré.</p>}
          {!available && <p>Données non disponibles.</p>}
        </section>
      </div>
    </details>
    <details className="homeDetails">
      <summary>Activité des entreprises <small>Ventes, entreprises récentes et journal</small></summary>
      <div className="homeDetailsBody">
        <section className="panel"><div className="panelHead"><h2>Ventes enregistrées par les entreprises</h2><button className="detailsBtn" disabled={!available} onClick={() => exportDashboard(stats)}>Rapport PDF</button></div>
          <p>Montants des ventes sur les six derniers mois, séparés par devise. Ces ventes appartiennent aux entreprises clientes.</p>
          {!!currencies.length && <label className="chartCurrency">Devise<select value={selectedCurrency} onChange={event => setCurrency(event.target.value)}>{currencies.map(item => <option key={item} value={item}>{currencyLabel(item)}</option>)}</select></label>}
          {available && months.length > 0 ? <table className="salesFigures"><thead><tr><th>Mois</th><th>Ventes</th><th>Montant</th></tr></thead><tbody>{months.map(month => <tr key={`${month.month}-${month.currency_code}`}><td>{month.month.split('-').reverse().join('/')}</td><td>{month.sales}</td><td>{money(month.revenue, month.currency_code)}</td></tr>)}</tbody></table> : <p>{available ? 'Aucune vente sur cette période.' : 'Données non disponibles.'}</p>}
        </section>
        <div className="twoCols">
          <section className="panel"><div className="panelHead"><h2>Entreprises récentes</h2><button className="textButton" onClick={() => go('Entreprises')}>Voir toutes</button></div>{available && companies.slice(0, 3).map(company => <div className="quick" key={company.id}><div><b>{company.name}</b><small>{company.user_count} utilisateurs · {company.store_count} boutiques</small></div></div>)}{available && !companies.length && <p>Aucune entreprise enregistrée.</p>}</section>
          <section className="panel"><div className="panelHead"><h2>Activité récente</h2><button className="textButton" onClick={() => go('Activité')}>Journal</button></div>{!unavailableViews.includes('Activité') && audit.slice(0, 4).map(item => <div className="activityMini" key={item.id}><i/><p><b>{item.action.replaceAll('_', ' ')}</b><small>{item.company?.name ?? 'Plateforme'} · {day(item.created_at)}</small></p></div>)}{unavailableViews.includes('Activité') ? <p>Journal indisponible. Actualisez pour réessayer.</p> : available && !audit.length && <p>Aucune activité récente.</p>}</section>
        </div>
      </div>
    </details>
  </>;
}
function Companies({ data, search, setSearch, status, setStatus, open, run }: { data: Company[]; search: string; setSearch: (value: string) => void; status: string; setStatus: (value: string) => void; open: (company: Company) => void; run: Run }) { const { planName } = usePlanCatalog(); const active = data.filter(company => company.is_active).length; const stores = data.reduce((sum, company) => sum + company.store_count, 0); return <><Title>Entreprises</Title><div className="pageSummary"><article><i>▦</i><div><span>Entreprises affichées</span><b>{data.length}</b></div></article><article><i>✓</i><div><span>Comptes actifs</span><b>{active}</b></div></article><article><i>⌂</i><div><span>Boutiques rattachées</span><b>{stores}</b></div></article></div><Toolbar search={search} setSearch={setSearch}><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="active">Actives</option><option value="inactive">Suspendues</option></select></Toolbar><Table heads={['Entreprise', 'Plan', 'Utilisateurs', 'Boutiques', 'Statut', 'Actions']}>{data.map(company => <tr key={company.id}><td><div className="entityCell"><span>{company.name.slice(0, 1).toUpperCase()}</span><div><b>{company.name}</b><small>{company.slug ?? 'Identifiant interne'}</small></div></div></td><td><span className="planTag">{planName(company.plan_code)}</span></td><td>{company.user_count}</td><td>{company.store_count}</td><td><Badge ok={company.is_active}>{company.is_active ? 'Actif' : 'Suspendu'}</Badge></td><td><ActionMenu><button className="detailsBtn" onClick={() => open(company)}>Ouvrir la fiche</button><button className={company.is_active ? 'dangerBtn' : 'successBtn'} onClick={() => void toggleCompanyAccess(company, run)}>{company.is_active ? 'Suspendre' : 'Réactiver'}</button></ActionMenu></td></tr>)}</Table></>; }
function Users({ data, search, setSearch, run }: { data: User[]; search: string; setSearch: (value: string) => void; run: Run }) { const [role, setRole] = useState('all'); const [userStatus, setUserStatus] = useState('all'); const roles = [...new Set(data.map(user => user.role_name))].sort(); const filtered = data.filter(user => (role === 'all' || user.role_name === role) && (userStatus === 'all' || (userStatus === 'active') === user.is_active)); return <><Title>Utilisateurs</Title><Toolbar search={search} setSearch={setSearch}><select value={role} onChange={event => setRole(event.target.value)}><option value="all">Tous les rôles</option>{roles.map(item => <option value={item} key={item}>{item}</option>)}</select><select value={userStatus} onChange={event => setUserStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="inactive">Inactifs</option></select>{(search || role !== 'all' || userStatus !== 'all') && <button className="resetFilters" onClick={() => { setSearch(''); setRole('all'); setUserStatus('all'); }}>Réinitialiser</button>}</Toolbar><Table heads={['Utilisateur', 'Entreprise', 'Rôle', 'Statut', 'Inscription', 'Actions']}>{filtered.map(user => <tr key={user.membership_id}><td><div className="entityCell"><span>{(user.full_name || user.email).slice(0, 1).toUpperCase()}</span><div><b>{user.full_name || user.email}</b><small>{user.email}</small></div></div></td><td>{user.company_name}</td><td><span className="planTag">{user.role_name}</span></td><td><Badge ok={user.is_active}>{user.is_active ? 'Actif' : 'Inactif'}</Badge></td><td>{day(user.created_at)}</td><td><ActionMenu><button className={user.is_active ? 'dangerBtn' : 'successBtn'} onClick={() => confirm(`${user.is_active ? 'Désactiver' : 'Réactiver'} cet accès ?`) && void run(() => supabase.rpc('set_membership_active', { p_membership_id: user.membership_id, p_active: !user.is_active }), 'Accès mis à jour.')}>{user.is_active ? 'Désactiver' : 'Réactiver'}</button></ActionMenu></td></tr>)}</Table></>; }
const remainingDays = (value: string | null) => value ? Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)) : 0;
function TrialCard({ company, changePlan }: { company: Company; changePlan: (company: Company, code: string) => void }) { const { plans, planName } = usePlanCatalog(); const end = company.trial_ends_at ?? company.subscription_expires_at; const remaining = remainingDays(end); const startTime = company.subscription_starts_at ? new Date(company.subscription_starts_at).getTime() : Date.now(); const endTime = end ? new Date(end).getTime() : startTime; const total = Math.max(1, Math.ceil((endTime - startTime) / 86400000)); const progress = Math.max(0, Math.min(100, remaining / total * 100)); return <article className="trialCard"><header><div className="entityCell"><span>{company.name.slice(0, 1).toUpperCase()}</span><div><b>{company.name}</b><small>{planName(company.plan_code)}</small></div></div><Badge ok={remaining > 0}>{remaining > 0 ? 'En essai' : 'Expiré'}</Badge></header><div className="trialDays"><strong>{remaining}</strong><span>jour{remaining > 1 ? 's' : ''}<br/>restant{remaining > 1 ? 's' : ''}</span></div><div className="trialProgress"><i style={{ width: `${progress}%` }}/></div><dl><div><dt>Début</dt><dd>{company.subscription_starts_at ? day(company.subscription_starts_at) : '—'}</dd></div><div><dt>Fin de l’essai</dt><dd>{end ? day(end) : '—'}</dd></div><div><dt>Boutiques</dt><dd>{company.store_count}</dd></div><div><dt>Utilisateurs</dt><dd>{company.user_count}</dd></div></dl><select className="actionSelect" defaultValue="" onChange={event => { changePlan(company, event.target.value); event.currentTarget.value = ''; }}><option value="" disabled>Convertir vers un forfait</option>{plans.map(plan => <option key={plan.code} value={plan.code}>Activer {plan.name} · 30 jours</option>)}</select></article>; }
function TrialControls({ companies, run, configureTrials }: { companies: Company[]; run: Run; configureTrials: () => void }) {
  const { plans, planName } = usePlanCatalog();
  const [companyId, setCompanyId] = useState('');
  const [days, setDays] = useState(14);
  const [planCode, setPlanCode] = useState('basic');
  const validDays = Number.isInteger(days) && days >= 1 && days <= 90;
  function grant() {
    const company = companies.find(item => item.id === companyId);
    if (!company || !validDays || !plans.some(plan => plan.code === planCode)) return;
    if (confirm(`Attribuer ${days} jours d’essai ${planName(planCode)} à ${company.name} ?`)) void run(() => supabase.rpc('super_admin_grant_trial', { p_company_id: companyId, p_days: days, p_plan_code: planCode }), 'Essai gratuit attribué.');
  }
  return <>
    <section className="trialControls trialControlsSimplified">
      <article><header><i>+</i><div><b>Attribuer un essai</b><span>Un essai spécifique pour une entreprise.</span></div></header>
        <label>Entreprise<select value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">Sélectionner une entreprise</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label>Forfait d’essai<select value={planCode} onChange={event => setPlanCode(event.target.value)}>{plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
        <label>Durée en jours<input type="number" min="1" max="90" step="1" value={days} onChange={event => setDays(Number(event.target.value))}/></label>
        <button className="primary" disabled={!companyId || !plans.some(plan => plan.code === planCode) || !validDays} onClick={grant}>Attribuer l’essai</button>
      </article>
      <article className="offerControl"><header><i>%</i><div><b>Offre commerciale</b><span>Jours gratuits, remise fixe ou pourcentage.</span></div></header><button className="detailsBtn" onClick={() => window.dispatchEvent(new Event('stockmaster:open-promotions'))}>Gérer les promotions</button></article>
    </section>
    <div className="settingsShortcut"><p>La durée des essais automatiques et le délai de grâce se règlent dans les paramètres de la plateforme.</p><button className="detailsBtn" onClick={configureTrials}>Régler les essais automatiques</button></div>
  </>;
}
function Subscriptions({ companies, stats, run, configureTrials }: { companies: Company[]; stats: Stats | null; run: Run; configureTrials: () => void }) {
  const { plans, planName } = usePlanCatalog();
  const [mode, setMode] = useState<'subscriptions' | 'trials'>('subscriptions');
  const [query, setQuery] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const filtered = companies.filter(company => (!query.trim() || company.name.toLowerCase().includes(query.toLowerCase().trim())) && (mode === 'trials' ? company.subscription_status === 'trialing' : subscriptionStatus === 'all' || (company.subscription_status ?? 'none') === subscriptionStatus) && (plan === 'all' || (company.plan_code ?? 'none') === plan));
  function changePlan(company: Company, code: string) { if (!code || !confirm(`Attribuer le forfait ${planName(code)} à ${company.name} pour 30 jours ?`)) return; void run(() => supabase.rpc('super_admin_set_company_plan', { p_company_id: company.id, p_plan_code: code, p_duration_days: 30 }), 'Forfait attribué.'); }
  return <><Title description={pageDescriptions.Abonnements}>Essais et abonnements</Title>
    <div className="kpis"><Kpi label="Total abonnements" value={companies.length} note="Toutes entreprises"/><Kpi label="Abonnements actifs" value={stats?.subscriptions?.active ?? 0} note="Forfaits en cours"/><Kpi label="En essai" value={stats?.subscriptions?.trialing ?? 0} note="Périodes d’essai"/><Kpi label="Expirés" value={stats?.subscriptions?.expired ?? 0} note="À renouveler"/></div>
    <div className="subscriptionTabs"><button className={mode === 'subscriptions' ? 'active' : ''} onClick={() => setMode('subscriptions')}><i>◆</i><span><b>Abonnements actuels</b><small>Forfaits, échéances et statuts</small></span></button><button className={mode === 'trials' ? 'active' : ''} onClick={() => setMode('trials')}><i>◷</i><span><b>Essais et offres</b><small>Attribution, durée et promotions</small></span></button></div>
    {mode === 'trials' && <TrialControls companies={companies} run={run} configureTrials={configureTrials}/>}
    <Toolbar search={query} setSearch={setQuery}>{mode === 'subscriptions' && <select value={subscriptionStatus} onChange={event => setSubscriptionStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="trialing">En essai</option><option value="active">Actifs</option><option value="past_due">Paiement en retard</option><option value="expired">Expirés</option><option value="none">Sans abonnement</option></select>}<select value={plan} onChange={event => setPlan(event.target.value)}><option value="all">Tous les forfaits</option>{plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}<option value="none">Sans forfait</option></select>{(query || subscriptionStatus !== 'all' || plan !== 'all') && <button className="resetFilters" onClick={() => { setQuery(''); setSubscriptionStatus('all'); setPlan('all'); }}>Réinitialiser</button>}</Toolbar>
    {mode === 'trials' ? <>{filtered.length ? <div className="trialGrid">{filtered.map(company => <TrialCard key={company.id} company={company} changePlan={changePlan}/>)}</div> : <div className="trialsEmpty"><i>✓</i><b>Aucun essai correspondant</b><span>Vous pouvez attribuer un nouvel essai avec le formulaire ci-dessus.</span></div>}</> : <Table heads={['Entreprise', 'Plan actuel', 'Statut', 'Début', 'Expiration', 'Jours restants', 'Modifier le forfait']}>{filtered.map(company => <tr key={company.id}><td><div className="entityCell"><span>{company.name.slice(0, 1).toUpperCase()}</span><div><b>{company.name}</b><small>{company.slug ?? 'Entreprise StockMaster'}</small></div></div></td><td><span className="planTag">{planName(company.plan_code)}</span></td><td><Badge ok={company.subscription_status === 'active' || company.subscription_status === 'trialing'}>{subscriptionStatusLabel(company.subscription_status)}</Badge></td><td>{company.subscription_starts_at ? day(company.subscription_starts_at) : '—'}</td><td><b className="expiryDate">{company.subscription_expires_at ? day(company.subscription_expires_at) : '—'}</b></td><td><span className={`daysLeft ${remainingDays(company.subscription_expires_at) <= 5 ? 'urgent' : ''}`}>{company.subscription_expires_at ? `${remainingDays(company.subscription_expires_at)} j` : '—'}</span></td><td><select className="actionSelect" defaultValue="" onChange={event => { changePlan(company, event.target.value); event.currentTarget.value = ''; }}><option value="" disabled>Choisir un forfait</option>{plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name} · 30 jours</option>)}</select></td></tr>)}</Table>}
  </>;
}

function Payments({ data, search, setSearch, status, setStatus, run, proof }: { data: Payment[]; search: string; setSearch: (value: string) => void; status: string; setStatus: (value: string) => void; run: Run; proof: (payment: Payment) => Promise<void> }) {
  const [method, setMethod] = useState<'all' | 'orange_money_manual' | 'stripe'>('all');
  const [currency, setCurrency] = useState('GNF');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const currencies = ['GNF', ...Array.from(new Set(data.map(payment => normalizeCurrency(payment.currency)))).filter(item => item !== 'GNF').sort()];
  const filtered = data.filter(payment =>
    (method === 'all' || payment.provider === method) &&
    (currency === 'all' || normalizeCurrency(payment.currency) === currency) &&
    (archiveFilter === 'all' || (archiveFilter === 'archived' ? Boolean(payment.archived_at) : !payment.archived_at))
  );
  const current = data.filter(payment => !payment.archived_at);
  const succeeded = current.filter(payment => payment.status === 'succeeded').length;
  const pending = current.filter(payment => payment.status === 'processing' || payment.status === 'pending').length;
  const stripe = current.filter(payment => payment.provider === 'stripe').length;
  return <>
    <Title>Paiements</Title>
    <div className="pageSummary paymentSummary">
      <article><i>✓</i><div><span>Paiements confirmés</span><b>{succeeded}</b></div></article>
      <article><i>!</i><div><span>À vérifier</span><b>{pending}</b></div></article>
      <article><i>CB</i><div><span>Paiements par carte</span><b>{stripe}</b></div></article>
    </div>
    <div className="paymentControlBar">
      <div className="paymentMethods">
        <button className={method === 'all' ? 'active' : ''} onClick={() => setMethod('all')}>Tous les moyens</button>
        <button className={method === 'orange_money_manual' ? 'active' : ''} onClick={() => setMethod('orange_money_manual')}>Orange Money</button>
        <button className={method === 'stripe' ? 'active' : ''} onClick={() => setMethod('stripe')}>Carte bancaire · Stripe</button>
      </div>
      <label className="currencyPicker"><span>Devise</span><select value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(item => <option value={item} key={item}>{currencyLabel(item)}</option>)}<option value="all">Toutes les devises</option></select></label>
    </div>
    <div className="warningBox">Les paiements sont affichés en FG par défaut. Les autres devises restent séparées et ne sont jamais additionnées sans conversion.</div>
    <Toolbar search={search} setSearch={setSearch}>
      <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="processing">En attente</option><option value="succeeded">Payés</option><option value="failed">Refusés</option></select>
      <select value={archiveFilter} onChange={event => setArchiveFilter(event.target.value as 'active' | 'archived' | 'all')}><option value="active">Paiements actifs</option><option value="archived">Paiements archivés</option><option value="all">Actifs et archivés</option></select>
    </Toolbar>
    <Table heads={['Référence', 'Entreprise', 'Montant', 'Méthode', 'Reçu le', 'Statut', 'Actions']}>
      {filtered.map(payment => <tr key={payment.id}>
        <td><b>{payment.provider_reference ?? 'Sans référence'}</b></td>
        <td><div className="entityCell"><span>{payment.company_name.slice(0, 1).toUpperCase()}</span><div><b>{payment.company_name}</b><small>{payment.client_email}</small></div></div></td>
        <td><b>{money(payment.amount, payment.currency)}</b></td>
        <td><span className={payment.provider === 'stripe' ? 'methodBadge card' : 'methodBadge om'}>{payment.provider === 'stripe' ? 'Carte bancaire' : 'Orange Money'}</span></td>
        <td>{day(payment.created_at)}</td>
        <td><Badge ok={payment.status === 'succeeded' && !payment.archived_at}>{payment.archived_at ? 'Archivé' : payment.status}</Badge></td>
        <td><button className="detailsBtn paymentReviewButton" onClick={() => setSelectedPayment(payment)}>Examiner</button></td>
      </tr>)}
    </Table>
    {selectedPayment && <PaymentReviewDialog payment={selectedPayment} close={() => setSelectedPayment(null)} run={run} proof={proof}/>}
  </>;
}

function PaymentReviewDialog({ payment, close, run, proof }: { payment: Payment; close: () => void; run: Run; proof: (payment: Payment) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  async function manage(action: 'confirm' | 'reject' | 'archive' | 'restore' | 'delete') {
    const actionReason = reason.trim();
    if (action !== 'restore' && actionReason.length < 3) {
      setLocalError('Saisissez un motif d’au moins 3 caractères pour assurer la traçabilité.');
      return;
    }
    const confirmations: Partial<Record<typeof action, string>> = {
      confirm: `Avez-vous vérifié dans le relevé du compte destinataire la réception de ${money(payment.amount, payment.currency)}, avec la référence ${payment.provider_reference ?? 'à vérifier'} ? Une capture seule ne suffit pas. Confirmer ce paiement ?`,
      reject: 'Refuser ce paiement ? Cette décision sera enregistrée dans le journal.',
      archive: 'Archiver ce paiement ? Il restera disponible dans le filtre « Paiements archivés ».',
      restore: 'Restaurer ce paiement dans la liste active ?',
      delete: 'Supprimer définitivement ce paiement non confirmé ? Cette action est irréversible.',
    };
    if (!window.confirm(confirmations[action] ?? 'Confirmer cette action ?')) return;
    setLocalError('');
    const saved = await run(
      () => supabase.rpc('super_admin_manage_payment', {
        p_payment_id: payment.id,
        p_action: action,
        p_reason: action === 'restore' ? null : actionReason,
      }),
      ({ confirm: 'Paiement confirmé.', reject: 'Paiement refusé.', archive: 'Paiement archivé.', restore: 'Paiement restauré.', delete: 'Paiement supprimé.' } as const)[action],
    );
    if (saved) close();
  }
  const canReview = (payment.status === 'processing' || payment.status === 'pending') && !payment.archived_at;
  const canDelete = payment.status !== 'succeeded' && !payment.provider_reference;
  return <div className="drawerBack" onMouseDown={event => event.target === event.currentTarget && close()}>
    <section className="drawer paymentReviewModal">
      <div className="modalHead">
        <div><span className="paymentReviewIcon">{payment.provider === 'stripe' ? 'CB' : 'OM'}</span><div><small>TRAITEMENT DU PAIEMENT</small><h1>{payment.company_name}</h1></div></div>
        <button className="close" onClick={close} aria-label="Fermer">×</button>
      </div>
      <div className="paymentReviewAmount"><span>Montant déclaré</span><strong>{money(payment.amount, payment.currency)}</strong><Badge ok={payment.status === 'succeeded' && !payment.archived_at}>{payment.archived_at ? 'Archivé' : payment.status}</Badge></div>
      <dl className="paymentReviewDetails">
        <div><dt>Référence</dt><dd>{payment.provider_reference ?? 'Non renseignée'}</dd></div>
        <div><dt>Client</dt><dd>{payment.client_email}</dd></div>
        <div><dt>Méthode</dt><dd>{payment.provider === 'stripe' ? 'Carte bancaire · Stripe' : 'Orange Money'}</dd></div>
        <div><dt>Date</dt><dd>{new Date(payment.created_at).toLocaleString('fr-FR')}</dd></div>
        <div><dt>Devise d’origine</dt><dd>{currencyLabel(payment.currency)}</dd></div>
        {payment.archived_at && <div><dt>Archivage</dt><dd>{new Date(payment.archived_at).toLocaleString('fr-FR')} · {payment.archive_reason ?? 'Motif non renseigné'}</dd></div>}
      </dl>
      {payment.proof_path && <button className="detailsBtn paymentProofButton" onClick={() => void proof(payment)}>Ouvrir le justificatif</button>}
      <div className="paymentDecision">
        {!payment.archived_at && <label>Motif de l’action <span>obligatoire pour confirmer, refuser, archiver ou supprimer</span><textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Exemple : paiement vérifié auprès du client…"/></label>}
        {localError && <div className="alert danger">{localError}</div>}
        {!canReview && !payment.archived_at && <div className="paymentLockedNotice">Ce paiement n’est plus en attente. Il ne peut pas être confirmé ou refusé, mais il peut être archivé.</div>}
        <div className="modalActions paymentActionBar">
          <button className="detailsBtn" onClick={close}>Fermer</button>
          {payment.archived_at ? <button className="successBtn" onClick={() => void manage('restore')}>Restaurer</button> : <>
            {canDelete && <button className="dangerBtn" onClick={() => void manage('delete')}>Supprimer</button>}
            <button className="detailsBtn archiveBtn" onClick={() => void manage('archive')}>Archiver</button>
            {canReview && <button className="dangerBtn" onClick={() => void manage('reject')}>Refuser</button>}
            {canReview && <button className="successBtn" onClick={() => void manage('confirm')}>Confirmer</button>}
          </>}
        </div>
      </div>
    </section>
  </div>;
}

function Promotions({ data, run }: { data: Promotion[]; run: Run }) { const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [promoStatus, setPromoStatus] = useState('all'); const [promoType, setPromoType] = useState('all'); const [form, setForm] = useState({ name: '', code: '', type: 'percentage', value: 10, expires: '', usageLimit: '' }); const active = data.filter(promotion => promotion.is_active && new Date(promotion.expires_at) >= new Date()).length; const expired = data.filter(promotion => new Date(promotion.expires_at) < new Date()).length; const filtered = data.filter(promotion => (!query.trim() || `${promotion.name} ${promotion.code ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())) && (promoType === 'all' || promotion.promotion_type === promoType) && (promoStatus === 'all' || (promoStatus === 'active' ? promotion.is_active && new Date(promotion.expires_at) >= new Date() : promoStatus === 'expired' ? new Date(promotion.expires_at) < new Date() : !promotion.is_active))); async function save(event: React.FormEvent) { event.preventDefault(); const expiresAt = new Date(`${form.expires}T23:59:59`); if (!form.name.trim() || !form.code.trim() || Number.isNaN(expiresAt.getTime())) return; const saved = await run(() => supabase.rpc('super_admin_save_promotion', { p_id: null, p_name: form.name.trim(), p_code: form.code.trim().toUpperCase(), p_type: form.type, p_value: Number(form.value), p_starts_at: new Date().toISOString(), p_expires_at: expiresAt.toISOString(), p_usage_limit: form.usageLimit ? Number(form.usageLimit) : null, p_audience: 'all', p_is_active: true, p_plan_ids: [] }), 'Promotion créée.'); if (saved) { setOpen(false); setForm({ name: '', code: '', type: 'percentage', value: 10, expires: '', usageLimit: '' }); } } return <><Title action={<button className="primary" onClick={() => setOpen(value => !value)}>{open ? 'Fermer le formulaire' : 'Nouvelle promotion'}</button>}>Promotions & codes</Title><div className="pageSummary"><article><i>%</i><div><span>Promotions créées</span><b>{data.length}</b></div></article><article><i>✓</i><div><span>Campagnes actives</span><b>{active}</b></div></article><article><i>◷</i><div><span>Campagnes expirées</span><b>{expired}</b></div></article></div>{open && <form className="promoForm panel" onSubmit={event => void save(event)}><div className="formIntro"><span>NOUVELLE CAMPAGNE</span><h2>Créer un avantage commercial</h2><p>Configurez un code clair, sa valeur et sa période de validité.</p></div><div><label>Nom de la campagne<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Code promotionnel<input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })}/></label></div><div><label>Type d’avantage<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="percentage">Pourcentage</option><option value="fixed_amount">Montant fixe</option><option value="free_days">Jours gratuits</option></select></label><label>Valeur<input required min="1" type="number" value={form.value} onChange={event => setForm({ ...form, value: Number(event.target.value) })}/></label></div><div><label>Date d’expiration<input required type="date" value={form.expires} onChange={event => setForm({ ...form, expires: event.target.value })}/></label><label>Limite d’utilisation<input min="1" type="number" value={form.usageLimit} onChange={event => setForm({ ...form, usageLimit: event.target.value })}/></label></div><button className="primary">Créer et activer la promotion</button></form>}<Toolbar search={query} setSearch={setQuery}><select value={promoStatus} onChange={event => setPromoStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="active">Actives</option><option value="inactive">Inactives</option><option value="expired">Expirées</option></select><select value={promoType} onChange={event => setPromoType(event.target.value)}><option value="all">Tous les types</option><option value="percentage">Pourcentage</option><option value="fixed_amount">Montant fixe</option><option value="free_days">Jours gratuits</option></select>{(query || promoStatus !== 'all' || promoType !== 'all') && <button className="resetFilters" onClick={() => { setQuery(''); setPromoStatus('all'); setPromoType('all'); }}>Réinitialiser</button>}</Toolbar><Table heads={['Code', 'Nom', 'Type', 'Valeur', 'Expire le', 'Statut', 'Action']}>{filtered.map(promotion => <tr key={promotion.id}><td><span className="promoCode">{promotion.code ?? '—'}</span></td><td><b>{promotion.name}</b></td><td>{promotion.promotion_type}</td><td><b>{promotion.value}</b></td><td>{day(promotion.expires_at)}</td><td><Badge ok={promotion.is_active}>{promotion.is_active ? 'Actif' : 'Inactif'}</Badge></td><td><ActionMenu><button className={promotion.is_active ? 'dangerBtn' : 'successBtn'} onClick={() => void run(() => supabase.from('promotions').update({ is_active: !promotion.is_active }).eq('id', promotion.id), 'Promotion mise à jour.')}>{promotion.is_active ? 'Désactiver' : 'Activer'}</button></ActionMenu></td></tr>)}</Table></>; }

function Support({ data, run }: { data: Ticket[]; run: Run }) { const [query, setQuery] = useState(''); const [ticketStatus, setTicketStatus] = useState('all'); const [priority, setPriority] = useState('all'); const filtered = data.filter(ticket => (!query.trim() || `${ticket.subject} ${ticket.company?.name ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())) && (ticketStatus === 'all' || ticket.status === ticketStatus) && (priority === 'all' || ticket.priority === priority)); return <><Title>Support et tickets</Title><Toolbar search={query} setSearch={setQuery}><select value={ticketStatus} onChange={event => setTicketStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="open">Ouverts</option><option value="in_progress">En traitement</option><option value="resolved">Résolus</option><option value="closed">Fermés</option></select><select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">Toutes les priorités</option><option value="low">Faible</option><option value="medium">Moyenne</option><option value="high">Élevée</option><option value="urgent">Urgente</option></select>{(query || ticketStatus !== 'all' || priority !== 'all') && <button className="resetFilters" onClick={() => { setQuery(''); setTicketStatus('all'); setPriority('all'); }}>Réinitialiser</button>}</Toolbar><Table heads={['ID Ticket', 'Entreprise', 'Sujet', 'Priorité', 'Statut', 'Date', 'Action']}>{filtered.map(ticket => <tr key={ticket.id}><td>#{ticket.id.slice(0, 5)}</td><td>{ticket.company?.name ?? '—'}</td><td><b>{ticket.subject}</b></td><td><Badge ok={ticket.priority === 'low'}>{ticket.priority}</Badge></td><td>{ticket.status}</td><td>{day(ticket.created_at)}</td><td><ActionMenu><button className="detailsBtn" onClick={() => { const response = prompt('Réponse :', ticket.resolution ?? ''); if (response !== null) void run(() => supabase.rpc('update_support_ticket', { p_ticket_id: ticket.id, p_status: 'resolved', p_resolution: response }), 'Ticket résolu.'); }}>Répondre et résoudre</button></ActionMenu></td></tr>)}</Table></>; }

function ErrorsPage({ data, run }: { data: ErrorEvent[]; run: Run }) {
  const [query,setQuery]=useState('');const[severity,setSeverity]=useState('all');const[state,setState]=useState('open');const[period,setPeriod]=useState('30');
  const [resolvingAll,setResolvingAll]=useState(false);
  async function resolveAll() {
    const before=new Date().toISOString();
    if (!window.confirm('Marquer toutes les erreurs ouvertes comme résolues, y compris hors des filtres actuels ? L’historique sera conservé. Cette action classe les incidents ; elle ne corrige pas leur cause.')) return;
    setResolvingAll(true);
    try { await run(()=>supabase.rpc('super_admin_resolve_all_errors',{p_before:before,p_note:'Résolution groupée par le Super Admin'}),'Les erreurs ouvertes ont été marquées comme résolues.'); }
    finally { setResolvingAll(false); }
  }
  const filtered=data.filter(item=>(!query.trim()||`${item.code} ${item.message} ${item.company?.name??''} ${item.platform??''}`.toLowerCase().includes(query.toLowerCase().trim()))&&(severity==='all'||item.severity===severity)&&(state==='all'||(state==='resolved')===Boolean(item.resolved_at))&&(period==='all'||Date.now()-new Date(item.created_at).getTime()<=Number(period)*86400000));
  const open=data.filter(item=>!item.resolved_at);const fatal=open.filter(item=>item.severity==='fatal');const recent=open.filter(item=>Date.now()-new Date(item.created_at).getTime()<=86400000);
  const update=(item:ErrorEvent,resolved:boolean)=>{const note=resolved?prompt('Note de résolution (facultative) :',item.resolution_note??''):null;if(resolved&&note===null)return;void run(()=>supabase.rpc('super_admin_resolve_error',{p_error_id:item.id,p_resolved:resolved,p_note:note}),resolved?'Erreur marquée comme résolue.':'Erreur rouverte.');};
  return <><Title description={pageDescriptions.Erreurs}>Erreurs techniques</Title><div className="settingsActions"><button className="successBtn" disabled={resolvingAll} onClick={()=>void resolveAll()}>{resolvingAll?'Résolution…':'Tout marquer comme résolu'}</button></div><p>La liste affiche les 500 événements les plus récents. La résolution groupée traite toutes les erreurs ouvertes enregistrées avant votre confirmation.</p><div className="pageSummary"><article><i>!</i><div><span>Erreurs ouvertes</span><b>{open.length}</b></div></article><article><i>×</i><div><span>Fatales</span><b>{fatal.length}</b></div></article><article><i>24h</i><div><span>Dernières 24 heures</span><b>{recent.length}</b></div></article></div><div className="warningBox">Les erreurs internes sont enregistrées ici pour le Super Admin. Les utilisateurs voient uniquement un message clair, jamais la pile technique complète.</div><Toolbar search={query} setSearch={setQuery}><select value={severity} onChange={event=>setSeverity(event.target.value)}><option value="all">Toutes les gravités</option><option value="warning">Avertissements</option><option value="error">Erreurs</option><option value="fatal">Fatales</option></select><select value={state} onChange={event=>setState(event.target.value)}><option value="open">Ouvertes</option><option value="resolved">Résolues</option><option value="all">Toutes</option></select><select value={period} onChange={event=>setPeriod(event.target.value)}><option value="1">24 heures</option><option value="7">7 jours</option><option value="30">30 jours</option><option value="all">Toute la période</option></select>{(query||severity!=='all'||state!=='open'||period!=='30')&&<button className="resetFilters" onClick={()=>{setQuery('');setSeverity('all');setState('open');setPeriod('30')}}>Réinitialiser</button>}</Toolbar><Table heads={['Gravité','Code et message','Entreprise','Appareil','Date','Statut','Action']}>{filtered.map(item=><tr key={item.id}><td><span className={`incidentSeverity ${item.severity}`}>{item.severity}</span></td><td><div className="incidentMessage"><b>{item.code}</b><span>{item.message}</span><details><summary>Détails techniques</summary><pre>{JSON.stringify(item.context??{},null,2)}</pre></details></div></td><td>{item.company?.name??'Plateforme'}<small className="cellNote">{item.user?.full_name??'Utilisateur'}</small></td><td>{item.platform??'—'}<small className="cellNote">v{item.app_version??'—'}</small></td><td>{new Date(item.created_at).toLocaleString('fr-FR')}</td><td><Badge ok={Boolean(item.resolved_at)}>{item.resolved_at?'Résolue':'Ouverte'}</Badge>{item.resolution_note&&<small className="cellNote">{item.resolution_note}</small>}</td><td><ActionMenu><button className={item.resolved_at?'detailsBtn':'successBtn'} onClick={()=>update(item,!item.resolved_at)}>{item.resolved_at?'Rouvrir':'Résoudre'}</button></ActionMenu></td></tr>)}</Table>{!filtered.length&&<div className="monitoringEmpty"><i>✓</i><b>Aucune erreur correspondante</b><span>Aucun incident dans les événements chargés pour ces filtres.</span></div>}</>;
}

function WarningsPage({ data,emailSummary,run }: { data:PlatformWarning[];emailSummary:EmailDeliverySummary[];run:Run }) {
  const[query,setQuery]=useState('');const[severity,setSeverity]=useState('all');const[state,setState]=useState('open');
  const configurationMissing=emailSummary.some(item=>/RESEND_API_KEY|NOTIFICATION_FROM_EMAIL/.test(item.last_error??''));
  const historicalMailOnly=emailSummary.some(item=>item.status==='expired')&&!emailSummary.some(item=>['pending','processing','failed'].includes(item.status)&&Number(item.total)>0);
  const currentWarnings=data.filter(item=>!(historicalMailOnly&&item.warning_type==='email_delivery'));
  const filtered=currentWarnings.filter(item=>!(configurationMissing&&item.warning_type==='email_delivery')&&(!query.trim()||`${item.title} ${item.detail} ${item.company_names.join(' ')}`.toLowerCase().includes(query.toLowerCase().trim()))&&(severity==='all'||item.severity===severity)&&(state==='all'||item.status===state));
  const open=currentWarnings.filter(item=>item.status==='open');const critical=open.filter(item=>item.severity==='critical');const mailTotal=(status:string)=>Number(emailSummary.find(item=>item.status===status)?.total??0);const lastMailError=emailSummary.find(item=>item.status==='failed')?.last_error??emailSummary.find(item=>item.status==='pending')?.last_error;
  const review=(item:PlatformWarning,status:'open'|'ignored'|'resolved')=>{const note=status==='open'?null:prompt(status==='ignored'?'Pourquoi ignorer cet avertissement ?':'Comment cet avertissement a-t-il été résolu ?',item.note??'');if(status!=='open'&&note===null)return;void run(()=>supabase.rpc('review_platform_warning',{p_warning_key:item.warning_key,p_status:status,p_note:note}),status==='resolved'?'Avertissement résolu.':status==='ignored'?'Avertissement ignoré.':'Avertissement rouvert.');};
  return <><Title description={pageDescriptions.Avertissements}>Avertissements et doublons</Title><div className="pageSummary"><article><i>⚠</i><div><span>À examiner</span><b>{open.length}</b></div></article><article><i>!</i><div><span>Critiques</span><b>{critical.length}</b></div></article><article><i>✉</i><div><span>Emails acceptés par Resend</span><b>{mailTotal('sent')}</b></div></article><article><i>…</i><div><span>Emails en attente/échec</span><b>{mailTotal('pending')+mailTotal('failed')}</b></div></article></div>{configurationMissing?<EmailConfiguration missing/>:lastMailError&&<div className="alert danger">Email : {lastMailError}</div>}<div className="warningBox">Une similarité commerciale déclenche une vérification, pas un blocage automatique. Les identifiants techniques et références de paiement identiques restent bloqués directement par la base.</div><Toolbar search={query} setSearch={setQuery}><select value={severity} onChange={event=>setSeverity(event.target.value)}><option value="all">Toutes les gravités</option><option value="critical">Critiques</option><option value="warning">À vérifier</option><option value="info">Informations</option></select><select value={state} onChange={event=>setState(event.target.value)}><option value="open">À examiner</option><option value="ignored">Ignorés</option><option value="resolved">Résolus</option><option value="all">Tous</option></select>{(query||severity!=='all'||state!=='open')&&<button className="resetFilters" onClick={()=>{setQuery('');setSeverity('all');setState('open')}}>Réinitialiser</button>}</Toolbar><div className="warningGrid">{filtered.map(item=><article className={`warningCard ${item.severity}`} key={item.warning_key}><header><span className={`incidentSeverity ${item.severity}`}>{item.severity==='critical'?'Critique':item.severity==='warning'?'À vérifier':'Information'}</span><small>{item.occurrence_count} correspondance(s)</small></header><h2>{item.title}</h2><p>{item.detail}</p>{item.company_names.length>0&&<div className="warningCompanies">{item.company_names.map(name=><span key={name}>{name}</span>)}</div>}{item.note&&<blockquote>{item.note}</blockquote>}<footer><time>{new Date(item.detected_at).toLocaleString('fr-FR')}</time><div>{item.status!=='open'&&<button className="detailsBtn" onClick={()=>review(item,'open')}>Rouvrir</button>}{item.status==='open'&&<button className="detailsBtn" onClick={()=>review(item,'ignored')}>Ignorer</button>}{item.status==='open'&&<button className="successBtn" onClick={()=>review(item,'resolved')}>Résoudre</button>}</div></footer></article>)}</div>{!filtered.length&&<div className="monitoringEmpty"><i>✓</i><b>Aucun avertissement correspondant</b><span>Aucune vérification manuelle n’est nécessaire pour ces filtres.</span></div>}</>;
}
function Activity({ data }: { data: Audit[] }) { const [query, setQuery] = useState(''); const [period, setPeriod] = useState('30'); const [scope, setScope] = useState('all'); const companies = [...new Set(data.map(item => item.company?.name).filter((name): name is string => Boolean(name)))].sort(); const filtered = data.filter(item => { const matchesQuery = !query.trim() || `${item.action} ${item.actor?.full_name ?? ''} ${item.company?.name ?? ''}`.toLowerCase().includes(query.toLowerCase().trim()); const matchesCompany = scope === 'all' || (scope === 'platform' ? !item.company?.name : item.company?.name === scope); const matchesPeriod = period === 'all' || Date.now() - new Date(item.created_at).getTime() <= Number(period) * 86400000; return matchesQuery && matchesCompany && matchesPeriod; }); return <><Title description={pageDescriptions.Activité}>Journal d’activité</Title><Toolbar search={query} setSearch={setQuery}><select value={period} onChange={event => setPeriod(event.target.value)}><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option><option value="all">Toute la période</option></select><select value={scope} onChange={event => setScope(event.target.value)}><option value="all">Toutes les sources</option><option value="platform">Plateforme</option>{companies.map(company => <option value={company} key={company}>{company}</option>)}</select>{(query || period !== '30' || scope !== 'all') && <button className="resetFilters" onClick={() => { setQuery(''); setPeriod('30'); setScope('all'); }}>Réinitialiser</button>}</Toolbar><div className="activityCount"><b>{filtered.length}</b> événement{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}</div><section className="timeline">{filtered.length ? filtered.map(item => <article key={item.id}><time>{new Date(item.created_at).toLocaleString('fr-FR')}</time><i/><div><b>{item.action.replaceAll('_', ' ')}</b><span>{item.company?.name ?? 'Plateforme'} · Par {item.actor?.full_name ?? 'le système'}</span></div></article>) : <p className="empty">Aucune activité ne correspond aux filtres.</p>}</section></>; }

function SettingsPage({ value, setValue, run, initialTab }: { value: Settings; setValue: (value: Settings) => void; run: Run; initialTab: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [accessLevel, setAccessLevel] = useState('Vérification…');
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [showMfaPanel, setShowMfaPanel] = useState(false);
  const [mfaEnrollment, setMfaEnrollment] = useState<{ id: string; qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const loadSecurity = useCallback(async () => {
    setSecurityError('');
    try {
      const [userResult, factorResult, sessionResult, currentContext] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.getSession(),
        getContext(),
      ]);
      if (userResult.error) throw userResult.error;
      if (factorResult.error) throw factorResult.error;
      const verified = factorResult.data?.totp.find(factor => factor.status === 'verified') ?? null;
      setAccountEmail(userResult.data.user?.email ?? '');
      setLastSignIn(userResult.data.user?.last_sign_in_at ?? null);
      setSessionExpiresAt(sessionResult.data.session?.expires_at ?? null);
      setMfaEnabled(Boolean(verified));
      setVerifiedFactorId(verified?.id ?? null);
      setAccessLevel(currentContext?.role === 'super_admin' ? 'Super Administrateur' : currentContext?.role ?? 'Non déterminé');
    } catch (caught) {
      setSecurityError(errorMessage(caught));
    }
  }, []);

  useEffect(() => { void loadSecurity(); }, [loadSecurity]);

  async function copyAccountEmail() {
    if (!accountEmail) return;
    await navigator.clipboard.writeText(accountEmail);
    setSecurityNotice('✓ Adresse email copiée.');
  }

  async function startMfaSetup() {
    setSecurityBusy(true); setSecurityError(''); setSecurityNotice('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'StockMaster Super Admin' });
      if (error) throw error;
      setMfaEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setMfaCode(''); setShowMfaPanel(true);
    } catch (caught) { setSecurityError(errorMessage(caught)); }
    finally { setSecurityBusy(false); }
  }

  async function verifyMfaSetup() {
    if (!mfaEnrollment || !/^\d{6}$/.test(mfaCode.trim())) { setSecurityError('Saisissez le code à 6 chiffres de votre application d’authentification.'); return; }
    setSecurityBusy(true); setSecurityError(''); setSecurityNotice('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaEnrollment.id });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({ factorId: mfaEnrollment.id, challengeId: challenge.data.id, code: mfaCode.trim() });
      if (verified.error) throw verified.error;
      setMfaEnrollment(null); setMfaCode(''); setShowMfaPanel(false);
      setSecurityNotice('✓ Double authentification activée manuellement.');
      await loadSecurity();
    } catch (caught) { setSecurityError(errorMessage(caught)); }
    finally { setSecurityBusy(false); }
  }

  async function disableMfa() {
    if (!verifiedFactorId || !window.confirm('Désactiver la double authentification de ce compte ?')) return;
    setSecurityBusy(true); setSecurityError(''); setSecurityNotice('');
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (error) throw error;
      setSecurityNotice('✓ Double authentification désactivée.');
      await loadSecurity();
    } catch (caught) { setSecurityError(errorMessage(caught)); }
    finally { setSecurityBusy(false); }
  }

  async function savePassword() {
    setSecurityError('');
    setSecurityNotice('');
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setSecurityError('Saisissez le mot de passe actuel et le nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('La confirmation du mot de passe ne correspond pas.');
      return;
    }
    if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setSecurityError('Le mot de passe doit compter au moins 10 caractères avec majuscule, minuscule, chiffre et symbole.');
      return;
    }
    setSecurityBusy(true);
    try {
      const email = accountEmail || (await supabase.auth.getUser()).data.user?.email;
      if (!email) throw new Error('Session invalide. Reconnectez-vous pour modifier votre mot de passe.');
      await changeWebPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityNotice('✓ Mot de passe mis à jour.');
    } catch (caught) {
      setSecurityError(errorMessage(caught));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function logoutOtherSessions() {
    setSecurityBusy(true);
    setSecurityError('');
    setSecurityNotice('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      setSecurityNotice('✓ Les autres appareils ont été déconnectés.');
    } catch (caught) {
      setSecurityError(errorMessage(caught));
    } finally {
      setSecurityBusy(false);
    }
  }

  function save() {
    void run(() => supabase.from('billing_settings').update(value).eq('id', true), 'Paramètres enregistrés.');
  }

  const passwordChecks = [
    ['10 caractères minimum', newPassword.length >= 10],
    ['Une majuscule et une minuscule', /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)],
    ['Un chiffre', /[0-9]/.test(newPassword)],
    ['Un symbole', /[^A-Za-z0-9]/.test(newPassword)],
  ] as const;

  return <>
    <Title description={pageDescriptions.Paramètres}>Paramètres de la plateforme</Title>
    <div className="settings">
      <nav>{(['Général', 'Paiements', 'Abonnements', 'Emails / API', 'Sécurité'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <section>
        {tab === 'Général' && <>
          <div className="settingsSectionHead"><span>CONFIGURATION</span><h2>État de la plateforme</h2><p>Informations techniques essentielles de votre espace Super Admin.</p></div>
          <div className="settingsShortcut"><p>Consultez la configuration et le suivi des emails dans la rubrique dédiée.</p><button className="detailsBtn" onClick={() => setTab('Emails / API')}>Vérifier les emails</button></div>
          <div className="statusCards"><article><span>Connexion Supabase</span><b className={configured ? 'good' : 'badText'}>{configured ? 'Configurée' : 'Manquante'}</b></article><article><span>Espace actuel</span><b>Super Administration</b></article><article><span>Contrôle d’accès</span><b>Rôle Super Admin requis</b></article></div>
        </>}
        {tab === 'Emails / API' && <EmailConfiguration/>}
        {tab === 'Paiements' && <>
          <div className="settingsSectionHead"><span>ENCAISSEMENTS</span><h2>Configuration des paiements</h2><p>Le franc guinéen (FG) est la devise principale. Les autres devises restent séparées.</p></div>
          <div className="providerGrid"><article><i>FG</i><div><b>Devise principale</b><span>Franc guinéen · code système GNF</span></div></article><article><i>CB</i><div><b>Carte bancaire · Stripe</b><span>Confirmation automatique après validation Stripe</span></div></article></div>
          <div className="settingsFormGroup"><label>Numéro Orange Money<input value={value.orange_money_number} onChange={event => setValue({ ...value, orange_money_number: event.target.value })}/></label><label>Nom du compte<input value={value.orange_money_account_name} onChange={event => setValue({ ...value, orange_money_account_name: event.target.value })}/></label></div>
          <div className="settingsActions"><button className="primary" onClick={save}>Enregistrer les paiements</button></div>
        </>}
        {tab === 'Abonnements' && <>
          <div className="settingsSectionHead"><span>FACTURATION</span><h2>Essais et abonnements</h2><p>Réglez les durées utilisées pour les nouveaux comptes.</p></div>
          <div className="settingsFormGroup"><label className="switchLabel">Essai gratuit activé<input type="checkbox" checked={value.trial_enabled} onChange={event => setValue({ ...value, trial_enabled: event.target.checked })}/></label><label>Durée de l’essai<input min="0" max="90" type="number" value={value.trial_days} onChange={event => setValue({ ...value, trial_days: Number(event.target.value) })}/></label><label>Délai de grâce<input min="0" max="30" type="number" value={value.grace_period_days} onChange={event => setValue({ ...value, grace_period_days: Number(event.target.value) })}/></label></div>
          <div className="settingsActions"><button className="primary" onClick={save}>Enregistrer les abonnements</button></div>
        </>}
        {tab === 'Sécurité' && <>
          <div className="settingsSectionHead"><span>COMPTE ET SESSIONS</span><h2>Sécurité du Super Admin</h2><p>La double authentification reste volontaire et n’est jamais activée automatiquement.</p></div>
          <div className="securityOverview">
            <article><i>SA</i><div><span>Compte connecté</span><b title={accountEmail}>{accountEmail || 'Compte Super Admin'}</b><button type="button" onClick={() => void copyAccountEmail()}>Copier l’email</button></div></article>
            <article><i>✓</i><div><span>Niveau d’accès vérifié</span><b>{accessLevel}</b><button type="button" onClick={() => void loadSecurity()}>Actualiser</button></div></article>
            <article><i>{mfaEnabled ? '2F' : '—'}</i><div><span>Double authentification</span><b className={mfaEnabled ? 'good' : ''}>{mfaEnabled ? 'Activée manuellement' : 'Non activée'}</b><button type="button" onClick={() => mfaEnabled ? void disableMfa() : setShowMfaPanel(value => !value)}>{mfaEnabled ? 'Désactiver' : 'Configurer'}</button></div></article>
          </div>
          {showMfaPanel && !mfaEnabled && <section className="mfaSetupPanel">
            <div><span>CONFIGURATION MANUELLE</span><h3>Double authentification</h3><p>Cette action ne démarre que lorsque vous la demandez. Scannez ensuite le QR code et saisissez le code à 6 chiffres.</p></div>
            {!mfaEnrollment ? <button className="primary" disabled={securityBusy} onClick={() => void startMfaSetup()}>Générer mon QR code</button> : <div className="mfaEnrollment">
              <img src={mfaEnrollment.qrCode} alt="QR code de double authentification"/>
              <div><small>Clé manuelle</small><code>{mfaEnrollment.secret}</code><label>Code de vérification<input inputMode="numeric" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} placeholder="000000"/></label><button className="successBtn" disabled={securityBusy || mfaCode.length !== 6} onClick={() => void verifyMfaSetup()}>Vérifier et activer</button></div>
            </div>}
          </section>}
          <div className="securitySettingsGrid">
            <section className="securityCard">
              <div className="securityCardHead"><div><span>MOT DE PASSE</span><h3>Modifier votre mot de passe</h3></div><button type="button" aria-label={showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'} onClick={() => setShowPasswords(value => !value)}>{showPasswords ? 'Masquer' : 'Afficher'}</button></div>
              <div className="securityFields">
                <label>Mot de passe actuel<input autoComplete="current-password" type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></label>
                <label>Nouveau mot de passe<input autoComplete="new-password" type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)}/></label>
                <label>Confirmer le mot de passe<input autoComplete="new-password" type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label>
              </div>
              <div className="passwordChecks">{passwordChecks.map(([label, valid]) => <span className={valid ? 'valid' : ''} key={label}><i>{valid ? '✓' : '○'}</i>{label}</span>)}</div>
              <button className="primary" disabled={securityBusy || !currentPassword || !newPassword || !confirmPassword} onClick={() => void savePassword()}>{securityBusy ? 'Traitement…' : 'Mettre à jour le mot de passe'}</button>
            </section>
            <section className="securityCard sessionCard">
              <div className="securityCardHead"><div><span>APPAREIL ACTUEL</span><h3>Session active</h3></div><button type="button" onClick={() => void loadSecurity()}>Actualiser</button></div>
              <p>Fermez les sessions ouvertes sur les autres téléphones et ordinateurs. Votre session actuelle restera connectée.</p>
              <div className="sessionStatus"><i>✓</i><span><b>{navigator.userAgent.includes('Mobile') ? 'Téléphone actuel' : 'Ordinateur actuel'}</b><small>{accountEmail || 'Super Admin'}</small></span></div>
              <dl className="sessionFacts"><div><dt>Dernière connexion</dt><dd>{lastSignIn ? new Date(lastSignIn).toLocaleString('fr-FR') : 'Non disponible'}</dd></div><div><dt>Expiration de la session</dt><dd>{sessionExpiresAt ? new Date(sessionExpiresAt * 1000).toLocaleString('fr-FR') : 'Non disponible'}</dd></div></dl>
              <button className="dangerBtn" disabled={securityBusy} onClick={() => void logoutOtherSessions()}>Déconnecter les autres appareils</button>
            </section>
          </div>
          {securityError && <div className="alert danger securityFeedback">{securityError}</div>}
          {securityNotice && <div className="alert success securityFeedback">{securityNotice}</div>}
        </>}
      </section>
    </div>
  </>;
}
function CompanyDetails({ company, close, run }: { company: Company; close: () => void; run: Run }) { const { planName } = usePlanCatalog(); return <div className="drawerBack" onMouseDown={event => event.target === event.currentTarget && close()}><section className="drawer companyModal"><div className="modalHead"><div><span className="companyIcon">E</span><div><small>FICHE ENTREPRISE</small><h1>{company.name}</h1></div></div><button className="close" onClick={close} aria-label="Fermer">×</button></div><Badge ok={company.is_active}>{company.is_active ? 'Entreprise active' : 'Entreprise suspendue'}</Badge><div className="drawerKpis"><Kpi label="Plan actuel" value={planName(company.plan_code)} note={subscriptionStatusLabel(company.subscription_status)}/><Kpi label="Expiration" value={company.subscription_expires_at ? day(company.subscription_expires_at) : '—'} note={company.subscription_expires_at ? `${remainingDays(company.subscription_expires_at)} jours restants` : 'Aucune échéance'}/><Kpi label="Boutiques" value={company.store_count} note="Points de vente"/><Kpi label="Utilisateurs" value={company.user_count} note="Comptes liés"/></div><section className="companyInfo"><h2>Informations</h2><dl><div><dt>Identifiant</dt><dd>{company.slug ?? company.id}</dd></div><div><dt>Devise</dt><dd>{company.currency_code}</dd></div><div><dt>Statut abonnement</dt><dd>{subscriptionStatusLabel(company.subscription_status)}</dd></div><div><dt>Début du forfait</dt><dd>{company.subscription_starts_at ? day(company.subscription_starts_at) : '—'}</dd></div><div><dt>Expiration actuelle</dt><dd>{company.subscription_expires_at ? day(company.subscription_expires_at) : '—'}</dd></div><div><dt>Fin de l’essai</dt><dd>{company.trial_ends_at ? day(company.trial_ends_at) : '—'}</dd></div><div><dt>Ventes enregistrées</dt><dd>{company.sale_count} · {money(company.revenue, company.currency_code)}</dd></div></dl></section><div className="modalActions"><button className="detailsBtn" onClick={close}>Fermer</button><button className={company.is_active ? 'dangerBtn' : 'successBtn'} onClick={() => void toggleCompanyAccess(company, run)}>{company.is_active ? 'Suspendre l’entreprise' : 'Réactiver l’entreprise'}</button></div></section></div>; }
function statusLabel(value:string) { return ({ active:'Actif',succeeded:'Actif',processing:'En attente',pending:'En attente',trialing:'En attente',expired:'Expiré',failed:'Expiré',inactive:'Inactif',suspended:'Inactif',open:'En attente',in_progress:'En attente',resolved:'Actif',closed:'Inactif' } as Record<string,string>)[value.toLowerCase()] ?? value; }
function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) { const value=typeof children==='string'?children:'';const pending=['processing','pending','trialing','open','in_progress'].includes(value.toLowerCase());return <span className={`badge ${pending?'pending':ok?'ok':'bad'}`}>{typeof children==='string'?statusLabel(children):children}</span>; }
function ActionMenu({children}:{children:React.ReactNode}) {
  const [open, setOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const closeOtherMenus = (event: Event) => { if ((event as CustomEvent<string>).detail !== menuId) setOpen(false); };
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('stockmaster:action-menu-open', closeOtherMenus);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('stockmaster:action-menu-open', closeOtherMenus);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuId]);
  function toggle() {
    if (!open) window.dispatchEvent(new CustomEvent('stockmaster:action-menu-open', { detail: menuId }));
    setOpen(value => !value);
  }
  return <div className={`actionMenu ${open ? 'open' : ''}`} ref={menuRef}>
    <button type="button" className="actionMenuTrigger" aria-label="Afficher les actions" aria-expanded={open} onClick={toggle}>⋯</button>
    {open && <div className="actionMenuPanel" onClick={() => setOpen(false)}>{children}</div>}
  </div>;
}
function Table({ heads, children }: { heads: string[]; children: React.ReactNode }) {
  const rows = React.Children.toArray(children);
  const count = rows.length;
  const pageSize = 10;
  const storageKey = `stockmaster:table-page:${heads.join('|')}`;
  const [page, setPage] = useState(() => {
    const stored = Number(window.sessionStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : 1;
  });
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    window.sessionStorage.setItem(storageKey, String(safePage));
  }, [page, safePage, storageKey]);

  return <section className="dataSection">
    <div className="tableMeta">
      <div><b>{count}</b><span>{count > 1 ? 'résultats' : 'résultat'}</span></div>
      <small>{count ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, count)} affiché(s)` : 'Données synchronisées avec Supabase'}</small>
    </div>
    <div className="tableWrap"><table><thead><tr>{heads.map(head => <th key={head}>{head}</th>)}</tr></thead><tbody>{count ? visibleRows : <tr><td className="emptyCell" colSpan={heads.length}><span className="emptyIcon">⌕</span><b>Aucune donnée trouvée</b><small>Modifiez la recherche ou les filtres puis réessayez.</small></td></tr>}</tbody></table></div>
    {totalPages > 1 && <nav className="tablePagination" aria-label="Pagination du tableau">
      <button type="button" className="secondaryButton" disabled={safePage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Précédent</button>
      <span>Page <b>{safePage}</b> sur {totalPages}</span>
      <button type="button" className="secondaryButton" disabled={safePage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Suivant</button>
    </nav>}
  </section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><WebSessionGate><App/></WebSessionGate></React.StrictMode>);
