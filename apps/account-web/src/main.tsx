import { notificationCutoff } from '../../../src/features/notifications/retention';
import { useActiveNotifications } from '../../../src/features/notifications/useActiveNotifications';
import { featureLabelsFor, formatBillingMoney, subscriptionStatusLabel } from '../../../src/constants/commercial';
import { webSiteUrl } from '../../shared/siteConfig';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { businessContext, configured, getAccessibleBusinesses, signIn, supabase, type BusinessAccess, type UserContext } from '../../shared/supabase';
import { employeeStoreIds, escapeHtml } from './account-logic';
import './account.css';
import './multi-business.css';
import '../../shared/ux.css';

type Subscription = { subscription_id: string | null; plan_id: string | null; plan_name: string | null; status: string | null; billing_cycle?: 'monthly' | 'annual' | null; expires_at: string | null; max_businesses: number; max_stores: number; max_employees: number };
type Plan = { id: string; code: string; name: string; description: string; monthly_price: number; annual_price: number; currency: string; max_businesses: number; max_stores: number; max_employees: number; plan_features?: { feature_key:string;is_enabled:boolean }[] };

type Payment = { id: string; provider: string; provider_reference: string | null; amount: number; base_amount: number; discount_amount: number; currency: string; status: string; failure_reason: string | null; created_at: string; plan: { name: string } | null };
type Company = { name: string; email: string | null; phone: string | null; address: string | null; default_currency_code: string; logo_url?: string | null; receipt_footer?: string | null };
type SecurityEvent = { id: string; event_type: string; device_label: string | null; created_at: string };
type Quote = { base_amount: number; discount_amount: number; final_amount: number; promotion_name: string | null; currency: string };
type Employee = { id: string; user_id: string; role_id: string; store_id: string | null; is_active: boolean; created_at: string; all_stores: boolean; membership_stores: { store_id: string }[] | null; profile: { full_name: string } | null; role: { name: string; code: string } | null; store: { name: string } | null };
type Role = { id: string; name: string };
type Store = { id: string; name: string };
type Ticket = { id: string; subject: string; description: string; priority: string; status: string; resolution: string | null; created_at: string };
type Notification = { id: string; title: string; body: string; type: string; read_at: string | null; created_at: string };
type Section = 'Tableau de bord' | 'Abonnement' | 'Paiements' | 'Historique' | 'Reçus' | 'Entreprise' | 'Utilisateurs' | 'Sécurité' | 'Support' | 'Notifications' | 'Profil';

const navItems: { section: Section; icon: string }[] = [
  { section: 'Tableau de bord', icon: '▦' }, { section: 'Abonnement', icon: '▣' }, { section: 'Paiements', icon: '▤' },
  { section: 'Reçus', icon: '▧' }, { section: 'Entreprise', icon: '□' }, { section: 'Utilisateurs', icon: '♧' },
  { section: 'Sécurité', icon: '◉' }, { section: 'Support', icon: '◌' },
];

const message = (value: unknown) => {const raw=value instanceof Error?value.message:typeof value==='object'&&value&&'message'in value?String(value.message):'';if(/failed to fetch|network/i.test(raw))return 'Connexion au serveur impossible. Vérifiez Internet puis réessayez.';if(/permission|row-level security|forbidden/i.test(raw))return 'Vous n’avez pas l’autorisation d’effectuer cette action.';if(/duplicate|unique|already exists/i.test(raw))return 'Cette information existe déjà.';return raw||'Opération impossible.'};
const formatDate = (value: string) => new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value));
const formatDateTime = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const money = formatBillingMoney;
const statusLabel = subscriptionStatusLabel;
const marketingUrl = () => webSiteUrl('marketing');

async function edgeErrorMessage(error: unknown) {
  const fallback = message(error);
  const response = (error as { context?: Response } | null)?.context;
  if (!response) return fallback;
  try {
    const payload = await response.clone().json() as { error?: string; message?: string };
    return payload.error || payload.message || fallback;
  } catch { return fallback; }
}

async function loadSubscriptionPlans(companyId: string) {
  const result = await supabase.rpc('company_subscription_plans', { p_company_id: companyId });
  return { data: (result.data ?? []) as Plan[], error: result.error, localized: true };
}

function Brand() {
  return <div className="accountBrand"><span>S<i>↗</i><b>▰</b></span><strong>Stock<em>Master</em></strong></div>;
}

function Login({ ready, initialError = '' }: { ready: (businesses: BusinessAccess[]) => void; initialError?: string }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false); const [error, setError] = useState(initialError); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await signIn(email, password); const businesses = (await getAccessibleBusinesses()).filter(item => item.role === 'company_admin'); if (!businesses.length) { await supabase.auth.signOut(); throw new Error('Ce portail est réservé au propriétaire ou administrateur de l’entreprise.'); } ready(businesses); }
    catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }
  async function reset() {
    if (!email.trim()) { setError('Saisissez d’abord votre adresse email.'); return; }
    setBusy(true); setError(''); setNotice(''); const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin }); setBusy(false);
    if (result.error) setError(result.error.message); else setNotice('Un email sécurisé vous a été envoyé.');
  }
  return <main className="loginPage"><section className="loginVisual"><Brand/><div><span>PORTAIL COMPTE CLIENT</span><h1>Votre activité.<br/>Votre abonnement.<br/><em>Un seul espace.</em></h1><p>Gérez votre forfait, vos paiements, vos utilisateurs et la sécurité de votre entreprise.</p></div><div className="loginPreview"><i>SM</i><div><small>Abonnement actuel</small><b>StockMaster Pro</b><span>Actif · sécurisé</span></div></div></section><form className="loginForm" onSubmit={submit}><span className="eyebrow">Heureux de vous revoir</span><h2>Connexion à votre compte</h2><p>Utilisez vos identifiants administrateur StockMaster.</p>{!configured && <div className="alert danger">La configuration Supabase est absente.</div>}<label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@entreprise.com" required/></label><label>Mot de passe<div className="passwordInput"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Votre mot de passe" required/><button type="button" onClick={() => setShow(value => !value)}>{show ? 'Masquer' : 'Voir'}</button></div></label><button type="button" className="textButton right" onClick={() => void reset()}>Mot de passe oublié ?</button>{error && <div className="alert danger">{error}</div>}{notice && <div className="alert success">{notice}</div>}<button className="primaryButton" disabled={busy || !configured}>{busy ? 'Connexion en cours…' : 'Se connecter →'}</button><a className="backMarketing" href={marketingUrl()}>← Retour au site StockMaster</a></form></main>;
}

function PasswordRecovery({ complete }: { complete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (password.length < 10) { setError('Le mot de passe doit contenir au moins 10 caractères.'); return; }
    if (password !== confirmation) { setError('Les mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const result = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (result.error) { setError(message(result.error)); return; }
    await supabase.auth.signOut();
    history.replaceState(null, '', location.pathname);
    complete();
  }
  return <main className="loginPage"><section className="loginVisual"><Brand/><div><span>SÉCURITÉ DU COMPTE</span><h1>Choisissez un<br/><em>nouveau mot de passe.</em></h1><p>Le lien reçu par email ne peut être utilisé que pour ce compte.</p></div></section><form className="loginForm" onSubmit={submit}><span className="eyebrow">Récupération sécurisée</span><h2>Nouveau mot de passe</h2><p>Utilisez au moins 10 caractères avec une majuscule, une minuscule, un chiffre et un symbole.</p>{error && <div className="alert danger">{error}</div>}<label>Nouveau mot de passe<div className="passwordInput"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required autoFocus/><button type="button" onClick={() => setShow(value => !value)}>{show ? 'Masquer' : 'Voir'}</button></div></label><label>Confirmer le mot de passe<input type={show ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} required/></label><button className="primaryButton" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button></form></main>;
}

function App() {
  const [recovering, setRecovering] = useState(() => /(?:^|[&#?])type=recovery(?:&|$)/.test(`${location.hash}${location.search}`));
  const [context, setContext] = useState<UserContext | null>(null); const [opening, setOpening] = useState(true); const [section, setSection] = useState<Section>(() => new URLSearchParams(location.search).get('portal') === 'subscription' ? 'Abonnement' : 'Tableau de bord');
  const [businesses, setBusinesses] = useState<BusinessAccess[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null); const [plans, setPlans] = useState<Plan[]>([]); const [payments, setPayments] = useState<Payment[]>([]); const [company, setCompany] = useState<Company>({ name: '', email: '', phone: '', address: '', default_currency_code: 'GNF' });
  const [events, setEvents] = useState<SecurityEvent[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [roles, setRoles] = useState<Role[]>([]); const [stores, setStores] = useState<Store[]>([]); const [tickets, setTickets] = useState<Ticket[]>([]); const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fullName, setFullName] = useState(''); const [userEmail, setUserEmail] = useState(''); const [orangeMoney, setOrangeMoney] = useState({ number: '', name: 'StockMaster' });
  const [planId, setPlanId] = useState(''); const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly'); const [provider, setProvider] = useState<'orange_money_manual' | 'stripe'>('orange_money_manual'); const [paymentStep, setPaymentStep] = useState<'method' | 'checkout'>('method'); const [promo, setPromo] = useState(''); const [reference, setReference] = useState(''); const [proof, setProof] = useState<File | null>(null); const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState('all'); const [period, setPeriod] = useState('all'); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [warnings, setWarnings] = useState<string[]>([]); const [mobileMenu, setMobileMenu] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false); const [ticketOpen, setTicketOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const params = new URLSearchParams(location.search);
      const handoff = params.get('handoff');
      const requestedCompanyId = params.get('companyId');
      const requestedPortal = params.get('portal');
      if (handoff) {
        params.delete('handoff');
        history.replaceState(null, '', `${location.pathname}${params.size ? `?${params.toString()}` : ''}`);
        const verified = await supabase.auth.verifyOtp({ token_hash: handoff, type: 'magiclink' });
        if (verified.error) {
          await supabase.auth.signOut({ scope: 'local' });
          if (mounted) {
            setError('Ce lien Account a expiré ou a déjà été utilisé. Ouvrez de nouveau Forfaits depuis StockMaster.');
            setOpening(false);
          }
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        setFullName(String(data.session.user.user_metadata?.full_name ?? ''));
        setUserEmail(data.session.user.email ?? '');
        const available = (await getAccessibleBusinesses().catch(() => [])).filter(item => item.role === 'company_admin');
        if (!mounted) return;
        setBusinesses(available);
        const requested = available.find(item => item.company_id === requestedCompanyId);
        if (requested) setContext(businessContext(requested));
        else if (available.length === 1) setContext(businessContext(available[0]));
        if (requestedPortal === 'subscription') setSection('Abonnement');
      }
      setOpening(false);
    })();
    return () => { mounted = false; };
  }, []);

  const load = useCallback(async () => {
    if (!context?.company_id) return; setLoading(true); setError(''); setWarnings([]);
    try {
      const [subResult, planResult, payResult, companyResult, billingResult, eventResult, employeeResult, roleResult, storeResult, ticketResult, notificationResult] = await Promise.all([
        supabase.rpc('current_subscription', { p_company_id: context.company_id }),
        loadSubscriptionPlans(context.company_id),
        supabase.from('payment_transactions').select('id,provider,provider_reference,amount,base_amount,discount_amount,currency,status,failure_reason,created_at,plan:plans(name)').eq('company_id', context.company_id).order('created_at', { ascending: false }).limit(100),
        supabase.from('companies').select('name,email,phone,address,default_currency_code,logo_url,receipt_footer').eq('id', context.company_id).single(),
        supabase.from('billing_settings').select('orange_money_number,orange_money_account_name').eq('id', true).single(),
        supabase.from('user_security_events').select('id,event_type,device_label,created_at').order('created_at', { ascending: false }).limit(30),
        supabase.from('memberships').select('id,user_id,role_id,store_id,is_active,created_at,all_stores,membership_stores(store_id),profile:profiles!memberships_user_id_fkey(full_name),role:roles!memberships_role_id_fkey(name,code),store:stores(name)').eq('company_id', context.company_id).order('created_at'),
        supabase.from('roles').select('id,name,code').eq('company_id', context.company_id).eq('code', 'employee').order('name'),
        supabase.from('stores').select('id,name').eq('company_id', context.company_id).eq('is_active', true).order('name'),
        supabase.from('support_tickets').select('id,subject,description,priority,status,resolution,created_at').eq('company_id', context.company_id).order('created_at', { ascending: false }),
        supabase.from('notifications').select('id,title,body,type,read_at,created_at').gt('created_at', notificationCutoff()).eq('company_id', context.company_id).order('created_at', { ascending: false }).limit(100),
      ]);
      for (const result of [subResult, planResult, payResult, companyResult, billingResult]) if (result.error) throw result.error;
      const currentSub = (Array.isArray(subResult.data) ? subResult.data[0] : subResult.data) as Subscription | null;
      setSubscription(currentSub); setPlans((planResult.data ?? []) as Plan[]); setPayments((payResult.data ?? []) as unknown as Payment[]); setCompany(companyResult.data as Company); setOrangeMoney({ number: billingResult.data?.orange_money_number ?? '', name: billingResult.data?.orange_money_account_name ?? 'StockMaster' });
      if (!eventResult.error) setEvents((eventResult.data ?? []) as SecurityEvent[]);
      if (!employeeResult.error) setEmployees(((employeeResult.data ?? []) as unknown as Employee[]).filter(item => item.role?.code === 'employee'));
      if (!roleResult.error) setRoles((roleResult.data ?? []) as Role[]); if (!storeResult.error) setStores((storeResult.data ?? []) as Store[]); if (!ticketResult.error) setTickets((ticketResult.data ?? []) as Ticket[]); if (!notificationResult.error) setNotifications((notificationResult.data ?? []) as Notification[]);
      setWarnings([
        !planResult.localized && 'tarifs localisés (catalogue standard affiché)',
        eventResult.error && 'journal de sécurité', employeeResult.error && 'utilisateurs', roleResult.error && 'rôles',
        storeResult.error && 'boutiques', ticketResult.error && 'support', notificationResult.error && 'notifications',
      ].filter((item): item is string => Boolean(item)));
      setPlanId(current => current || currentSub?.plan_id || planResult.data[0]?.id || '');
    } catch (caught) { setError(message(caught)); } finally { setLoading(false); }
  }, [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!context?.company_id) return;
    const companyId = context.company_id;
    const channel = supabase.channel(`account-live:${companyId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${companyId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `company_id=eq.${companyId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [context?.company_id, load]);

  const currentPlan = plans.find(plan => plan.id === subscription?.plan_id);
  const filteredPayments = useMemo(() => payments.filter(payment => (status === 'all' || payment.status === status) && (period === 'all' || Date.now() - new Date(payment.created_at).getTime() < Number(period) * 86400000)), [payments, status, period]);
  const activeNotifications = useActiveNotifications(notifications);
  const unread = activeNotifications.filter(item => !item.read_at).length;
  const initials = (fullName || 'Administrateur').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

  function navigate(next: Section) { setSection(next); setMobileMenu(false); setError(''); setNotice(''); if (next !== 'Paiements') setPaymentStep('method'); }
  function chooseBusiness(business: BusinessAccess) { setContext(businessContext(business)); setSection('Tableau de bord'); setPlanId(''); setSubscription(null); setPayments([]); setEmployees([]); setRoles([]); setStores([]); setTickets([]); setNotifications([]); setCompany({ name: '', email: '', phone: '', address: '', default_currency_code: 'GNF' }); }
  function acceptBusinesses(available: BusinessAccess[]) { setBusinesses(available); if (available.length === 1) chooseBusiness(available[0]); }
  async function signOut() { await supabase.auth.signOut(); setContext(null); setBusinesses([]); }
  async function getQuote() { if (!context?.company_id || !planId) return; setLoading(true); setError(''); const result = await supabase.rpc('subscription_quote', { p_company_id: context.company_id, p_plan_id: planId, p_billing_cycle: cycle, p_promo_code: promo.trim() || null }); setLoading(false); if (result.error) { setQuote(null); setError(result.error.message); } else setQuote((Array.isArray(result.data) ? result.data[0] : result.data) as Quote); }
  async function pay() {
    if (!context?.company_id || !planId) return; setLoading(true); setError(''); setNotice('');
    try {
      if (provider === 'stripe') { const result = await supabase.functions.invoke('create-payment', { body: { companyId: context.company_id, planId, billingCycle: cycle, provider: 'stripe', operationId: crypto.randomUUID(), promoCode: promo.trim() || null } }); if (result.error) throw new Error(await edgeErrorMessage(result.error)); if (result.data?.authorizationUrl) return location.assign(result.data.authorizationUrl); throw new Error(result.data?.error || 'Lien de paiement Stripe indisponible.'); }
      if (reference.trim().length < 4) throw new Error('Saisissez la référence de la transaction Orange Money.');
      let proofPath: string | null = null;
      if (proof) { if (proof.size > 4_194_304) throw new Error('Le justificatif dépasse 4 Mo.'); const user = (await supabase.auth.getUser()).data.user; if (!user) throw new Error('Votre session a expiré.'); proofPath = `${user.id}/${crypto.randomUUID()}-${proof.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const upload = await supabase.storage.from('payment-proofs').upload(proofPath, proof); if (upload.error) throw upload.error; }
      const result = await supabase.rpc('submit_manual_subscription_payment', { p_company_id: context.company_id, p_plan_id: planId, p_billing_cycle: cycle, p_reference: reference.trim(), p_proof_path: proofPath, p_promo_code: promo.trim() || null, p_operation_id: crypto.randomUUID() }); if (result.error) throw result.error;
      setReference(''); setProof(null); navigate('Historique'); setNotice('Paiement transmis. Vous recevrez une notification après validation.'); await load();
    } catch (caught) { setError(message(caught)); } finally { setLoading(false); }
  }
  async function saveCompany() { if (!context?.company_id) return; setLoading(true); setError(''); const [userResult, companyResult] = await Promise.all([supabase.auth.updateUser({ data: { full_name: fullName.trim() } }), supabase.from('companies').update({ name: company.name.trim(), email: company.email || null, phone: company.phone || null, address: company.address || null }).eq('id', context.company_id)]); setLoading(false); if (userResult.error || companyResult.error) setError(userResult.error?.message ?? companyResult.error?.message ?? 'Enregistrement impossible.'); else { setNotice('Informations de l’entreprise enregistrées.'); setProfileOpen(false); await load(); } }
  async function resetPassword() { const result = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: location.origin }); if (result.error) setError(result.error.message); else setNotice('Un lien sécurisé de changement de mot de passe vous a été envoyé.'); }
  async function logoutAll() { if (!confirm('Déconnecter tous les appareils de ce compte ?')) return; await supabase.rpc('record_security_event', { p_event_type: 'global_logout', p_device_label: navigator.userAgent.slice(0, 120) }); await supabase.auth.signOut({ scope: 'global' }); setContext(null); }
  async function markNotifications() { if (!context?.company_id) return; const result = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('company_id', context.company_id).is('read_at', null); if (result.error) setError(result.error.message); else { setNotifications(items => items.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))); setNotice('Toutes les notifications sont marquées comme lues.'); } }

  if (recovering) return <PasswordRecovery complete={() => { setRecovering(false); setOpening(false); }} />;
  if (opening) return <main className="opening"><Brand/><span>Ouverture de votre compte…</span></main>;
  if (!context && businesses.length > 1) return <BusinessPicker businesses={businesses} select={chooseBusiness} signOut={signOut}/>;
  if (!context) return <Login ready={acceptBusinesses} initialError={error}/>;

  return <div className="accountApp">
    <aside className={mobileMenu ? 'sidebar open' : 'sidebar'}><div className="sidebarHead"><Brand/><button onClick={() => setMobileMenu(false)}>×</button></div><nav>{navItems.map(item => <button className={section === item.section || (item.section === 'Paiements' && section === 'Historique') ? 'active' : ''} key={item.section} onClick={() => navigate(item.section)}><i>{item.icon}</i><span>{item.section}</span></button>)}</nav><div className="sidebarBottom"><button onClick={() => navigate('Profil')}><i className="avatar">{initials}</i><span><b>{fullName || 'Administrateur'}</b><small>Gérer mon profil</small></span></button><button className="logout" onClick={() => void signOut()}>↪ <span>Déconnexion</span></button></div></aside>
    <main className="accountMain"><header className="accountTopbar"><button className="mobileMenuButton" onClick={() => setMobileMenu(true)}>☰</button><div className="activeBusiness"><small>ENTREPRISE ACTIVE</small><b>{company.name || context.company_name || 'StockMaster'}</b>{businesses.length > 1 && <button onClick={() => setContext(null)}>Changer d’entreprise</button>}</div><div className="topActions"><button className="notificationButton" aria-label="Ouvrir le support" title="Support" onClick={() => navigate('Support')}>◌</button><button className="notificationButton" aria-label="Ouvrir les notifications" title="Notifications" onClick={() => navigate('Notifications')}>♢{unread > 0 && <i>{unread}</i>}</button><button className="profileButton" onClick={() => navigate('Profil')}><span>{initials}</span><div><b>{fullName || 'Administrateur'}</b><small>Propriétaire</small></div></button></div></header><div className="pageContent">{loading && <div className="alert floating">Traitement en cours…</div>}{error && <div className="alert danger">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="alert success">✓ {notice.replace(/^✓\s*/, '').replace(/\.$/,'')}<button onClick={() => setNotice('')}>×</button></div>}{warnings.length > 0 && <div className="alert warning">Données temporairement indisponibles : {warnings.join(', ')}.<button onClick={() => setWarnings([])}>×</button></div>}
      {section === 'Tableau de bord' && <Dashboard fullName={fullName} subscription={subscription} currentPlan={currentPlan} payments={payments} go={navigate} company={company}/>}
      {section === 'Abonnement' && <SubscriptionPage subscription={subscription} currentPlan={currentPlan} plans={plans} selectPlan={id => { setPlanId(id); navigate('Paiements'); }}/>}
      {section === 'Paiements' && <PaymentPage plans={plans} planId={planId} setPlanId={value => { setPlanId(value); setQuote(null); }} cycle={cycle} setCycle={value => { setCycle(value); setQuote(null); }} provider={provider} setProvider={setProvider} step={paymentStep} setStep={setPaymentStep} promo={promo} setPromo={value => { setPromo(value); setQuote(null); }} reference={reference} setReference={setReference} setProof={setProof} proof={proof} quote={quote} orangeMoney={orangeMoney} getQuote={getQuote} pay={pay} goHistory={() => navigate('Historique')}/>}
      {section === 'Historique' && <History payments={filteredPayments} status={status} setStatus={setStatus} period={period} setPeriod={setPeriod} company={company}/>}
      {section === 'Reçus' && <Invoices payments={payments} company={company}/>}
      {section === 'Entreprise' && <CompanyPage company={company} setCompany={setCompany} save={saveCompany}/>}
      {section === 'Utilisateurs' && <UsersPage context={context} employees={employees} roles={roles} stores={stores} open={inviteOpen} setOpen={setInviteOpen} reload={load} notify={setNotice} fail={setError}/>}
      {section === 'Sécurité' && <SecurityPage events={events} resetPassword={resetPassword} logoutAll={logoutAll} notify={setNotice} fail={setError}/>}
      {section === 'Support' && <SupportPage context={context} tickets={tickets} open={ticketOpen} setOpen={setTicketOpen} reload={load} notify={setNotice} fail={setError}/>}
      {section === 'Notifications' && <NotificationsPage items={activeNotifications} markAll={markNotifications}/>}
      {section === 'Profil' && <ProfilePage initials={initials} fullName={fullName} setFullName={setFullName} email={userEmail} company={company} setCompany={setCompany} editing={profileOpen} setEditing={setProfileOpen} save={saveCompany}/>}
      <footer className="legalLinks"><a href={`${marketingUrl()}/privacy/`} target="_blank">Confidentialité</a><a href={`${marketingUrl()}/terms/`} target="_blank">Conditions</a><a href={`${marketingUrl()}/legal-notice/`} target="_blank">Mentions légales</a><a href={`${marketingUrl()}/account-deletion/`} target="_blank">Suppression du compte</a></footer>
    </div></main>
  </div>;
}

function BusinessPicker({ businesses, select, signOut }: { businesses: BusinessAccess[]; select: (business: BusinessAccess) => void; signOut: () => Promise<void> }) {
  return <main className="businessPickerPage"><section className="businessPicker"><Brand/><span className="eyebrow">ESPACE COMPTE</span><h1>Choisissez une entreprise</h1><p>Les abonnements, paiements, reçus et utilisateurs affichés appartiendront uniquement à l’entreprise sélectionnée.</p><div className="businessChoices">{businesses.map(business => <button key={business.membership_id} onClick={() => select(business)}><i>{business.company_name.slice(0, 2).toUpperCase()}</i><span><b>{business.company_name}</b><small>{business.role_name || 'Administrateur'} · {statusLabel(business.subscription_status)}</small></span><strong>Ouvrir →</strong></button>)}</div><button className="textButton" onClick={() => void signOut()}>Se déconnecter</button></section></main>;
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="pageTitle"><div><span>MON COMPTE</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function Badge({ value }: { value: string | null | undefined }) { const normalized = value ?? 'inactive'; return <span className={`badge ${['active','succeeded','resolved'].includes(normalized) ? 'good' : ['expired','failed'].includes(normalized) ? 'bad' : ['processing','pending','trialing','open','in_progress'].includes(normalized)?'pending':'inactive'}`}>{statusLabel(normalized)}</span>; }
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="emptyState"><i>{icon}</i><h3>{title}</h3><p>{text}</p></div>; }
function useStoredPage(key:string,count:number,pageSize=8){const storageKey=`stockmaster:account-page:${key}`;const[page,setPage]=useState(()=>Math.max(1,Number(sessionStorage.getItem(storageKey))||1));const total=Math.max(1,Math.ceil(count/pageSize));const safe=Math.min(page,total);useEffect(()=>{if(page!==safe)setPage(safe);sessionStorage.setItem(storageKey,String(safe))},[page,safe,storageKey]);return{page:safe,setPage,total,start:(safe-1)*pageSize,end:Math.min(safe*pageSize,count)}}
function Pagination({page,total,setPage}:{page:number;total:number;setPage:(value:number)=>void}){if(total<=1)return null;return <nav className="tablePagination" aria-label="Pagination"><button className="secondaryButton" disabled={page===1} onClick={()=>setPage(Math.max(1,page-1))}>Précédent</button><span>Page <b>{page}</b> sur {total}</span><button className="secondaryButton" disabled={page===total} onClick={()=>setPage(Math.min(total,page+1))}>Suivant</button></nav>}

function PlanCard({ subscription, plan, action }: { subscription: Subscription | null; plan?: Plan; action: () => void }) { return <article className="planHero"><div><div className="planName"><span>StockMaster {subscription?.plan_name ?? plan?.name ?? 'Sans forfait'}</span><Badge value={subscription?.status}/></div><strong>{plan ? money(subscription?.billing_cycle === 'annual' ? plan.annual_price : plan.monthly_price, plan.currency) : '—'}<small>/{subscription?.billing_cycle === 'annual' ? 'an' : 'mois'}</small></strong><p>Échéance : <b>{subscription?.expires_at ? formatDate(subscription.expires_at) : 'Non défini'}</b></p></div><button className="primaryButton light" onClick={action}>Gérer mon abonnement</button></article>; }

function Dashboard({ fullName, subscription, currentPlan, payments, go, company }: { fullName: string; subscription: Subscription | null; currentPlan?: Plan; payments: Payment[]; go: (section: Section) => void; company: Company }) {
  const last = payments[0]; return <><PageTitle title={`Bonjour, ${fullName.split(' ')[0] || 'Administrateur'} 👋`} subtitle={`Voici un aperçu de votre compte ${company.name || 'StockMaster'}.`} action={<Badge value={subscription?.status}/>}/><div className="dashboardGrid"><PlanCard subscription={subscription} plan={currentPlan} action={() => go('Abonnement')}/><article className="recentCard panel"><div className="panelHead"><div><span>PAIEMENTS RÉCENTS</span><h2>Dernières opérations</h2></div><button className="textButton" onClick={() => go('Historique')}>Voir tout →</button></div>{payments.slice(0, 3).map(payment => <div className="compactPayment" key={payment.id}><i className={payment.provider === 'stripe' ? 'cardIcon' : 'omIcon'}>{payment.provider === 'stripe' ? 'CB' : 'OM'}</i><span><b>{formatDate(payment.created_at)}</b><small>{payment.provider === 'stripe' ? 'Carte bancaire' : 'Orange Money'}</small></span><strong>{money(payment.amount, payment.currency)}</strong></div>)}{!payments.length && <Empty icon="▤" title="Aucun paiement" text="Vos prochaines opérations apparaîtront ici."/>}</article></div><section className="summarySection"><h2>Résumé du compte</h2><div className="summaryGrid"><article><i>✓</i><span>Statut<b>{statusLabel(subscription?.status)}</b></span></article><article><i>◷</i><span>Échéance de l’abonnement<b>{subscription?.expires_at ? formatDate(subscription.expires_at) : '—'}</b></span></article><article><i>{last?.provider === 'stripe' ? 'CB' : 'OM'}</i><span>Moyen de paiement<b>{last?.provider === 'stripe' ? 'Carte bancaire' : last ? 'Orange Money' : '—'}</b></span></article><article><i className="warning">!</i><span>Paiements en attente<b>{payments.filter(payment => ['pending', 'processing'].includes(payment.status)).length}</b></span></article></div></section></>;
}

function SubscriptionPage({ subscription, currentPlan, plans, selectPlan }: { subscription: Subscription | null; currentPlan?: Plan; plans: Plan[]; selectPlan: (id: string) => void }) {
  const [billingView, setBillingView] = useState<'monthly'|'annual'>('monthly');
  const features = featureLabelsFor((currentPlan?.plan_features ?? []).filter(feature => feature.is_enabled).map(feature => feature.feature_key));
  return <>
    <PageTitle title="Mon abonnement" subtitle="Votre forfait actuel, ses limites et toutes les offres StockMaster." action={<Badge value={subscription?.status}/>}/>
    <div className="subscriptionLayout">
      <PlanCard subscription={subscription} plan={currentPlan} action={() => currentPlan ? selectPlan(currentPlan.id) : plans[0] && selectPlan(plans[0].id)}/>
      <section className="panel planDetails">
        <div className="panelHead"><div><span>FORFAIT ACTUEL</span><h2>{currentPlan?.name ?? subscription?.plan_name ?? 'Aucun forfait actif'}</h2></div></div>
        <div className="featureList">{features.map(item => <span key={item}>✓ {item}</span>)}</div>
        <div className="quotaGrid"><article><b>{subscription?.max_businesses ?? currentPlan?.max_businesses ?? 0}</b><span>Entreprise(s)</span></article><article><b>{subscription?.max_stores ?? currentPlan?.max_stores ?? 0}</b><span>Boutique(s) par entreprise</span></article><article><b>{subscription?.max_employees ?? currentPlan?.max_employees ?? 0}</b><span>Employé(s) actif(s) par entreprise</span></article></div>
      </section>
    </div>
    <section className="planCatalogSection">
      <div className="catalogHeading"><div><span className="eyebrow">TOUS LES FORFAITS</span><h2>Choisissez l’offre adaptée à votre entreprise</h2><p>Les montants sont affichés dans la devise configurée par le catalogue disponible.</p></div><div className="billingToggle"><button className={billingView==='monthly'?'active':''} onClick={()=>setBillingView('monthly')}>Mensuel</button><button className={billingView==='annual'?'active':''} onClick={()=>setBillingView('annual')}>Annuel</button></div></div>
      {plans.length ? <div className="planCatalogGrid">{plans.map(plan => {const included=featureLabelsFor((plan.plan_features??[]).filter(item=>item.is_enabled).map(item=>item.feature_key));const selected=subscription?.plan_id===plan.id;const amount=billingView==='annual'?plan.annual_price:plan.monthly_price;return <article className={`catalogPlan ${selected?'selected':''} ${plan.code==='pro'?'recommended':''}`} key={plan.id}>{plan.code==='pro'&&<span className="recommendation">RECOMMANDÉ</span>}<div className="catalogPlanHead"><div><span>StockMaster</span><h3>{plan.name}</h3></div>{selected&&<Badge value={subscription?.status}/>}</div><p>{plan.description || 'Un forfait StockMaster adapté à votre activité.'}</p><strong className="catalogPrice">{money(amount,plan.currency)}<small>/{billingView==='annual'?'an':'mois'}</small></strong><div className="catalogQuotas"><span>{plan.max_businesses} entreprise(s)</span><span>{plan.max_stores} boutique(s) par entreprise</span><span>{plan.max_employees} employé(s) actif(s) par entreprise</span></div><ul>{included.length?included.map(item=><li key={item}>✓ {item}</li>):<li>Détail des fonctionnalités indisponible.</li>}</ul><button className={selected?'secondaryButton':'primaryButton'} disabled={selected} onClick={()=>selectPlan(plan.id)}>{selected?'Forfait actuel':'Choisir ce forfait'}</button></article>})}</div> : <div className="panel"><Empty icon="▣" title="Forfaits momentanément indisponibles" text="Actualisez la page ou contactez l’assistance si le problème continue."/></div>}
    </section>
  </>;
}

function PaymentPage({ plans, planId, setPlanId, cycle, setCycle, provider, setProvider, step, setStep, promo, setPromo, reference, setReference, proof, setProof, quote, orangeMoney, getQuote, pay, goHistory }: { plans: Plan[]; planId: string; setPlanId: (value: string) => void; cycle: 'monthly'|'annual'; setCycle: (value: 'monthly'|'annual') => void; provider: 'orange_money_manual'|'stripe'; setProvider: (value: 'orange_money_manual'|'stripe') => void; step: 'method'|'checkout'; setStep: (value: 'method'|'checkout') => void; promo: string; setPromo: (value: string) => void; reference: string; setReference: (value: string) => void; proof: File | null; setProof: (file: File | null) => void; quote: Quote | null; orangeMoney: { number: string; name: string }; getQuote: () => Promise<void>; pay: () => Promise<void>; goHistory: () => void }) {
  const selected = plans.find(plan => plan.id === planId); return <><PageTitle title="Paiement" subtitle="Choisissez votre forfait et votre moyen de paiement." action={<button className="secondaryButton" onClick={goHistory}>Historique</button>}/><div className="paymentLayout"><section className="panel checkoutPanel"><div className="checkoutSteps"><span className="done">1</span><i/><span className={step === 'checkout' ? 'done' : ''}>2</span><i/><span>3</span></div><div className="formGrid"><label>Forfait<select value={planId} onChange={event => { setPlanId(event.target.value); setStep('method'); }}>{plans.map(plan => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></label><label>Période<select value={cycle} onChange={event => setCycle(event.target.value as 'monthly'|'annual')}><option value="monthly">Mensuelle</option><option value="annual">Annuelle</option></select></label><label className="wide">Code promotionnel<div className="inlineField"><input value={promo} onChange={event => setPromo(event.target.value.toUpperCase())} placeholder="FACULTATIF"/><button type="button" onClick={() => void getQuote()}>Appliquer</button></div></label></div>{step === 'method' ? <><h2 className="checkoutTitle">Choisir un moyen de paiement</h2><div className="paymentChoice"><button onClick={() => { setProvider('orange_money_manual'); setStep('checkout'); }}><i className="orangeLogo">↗↙</i><span><b>Orange Money</b><small>Paiement soumis à une vérification manuelle.</small></span><em>Choisir →</em></button><button onClick={() => { setProvider('stripe'); setStep('checkout'); }}><i className="bankCard">••</i><span><b>Carte bancaire</b><small>Carte traitée sur la page hébergée par Stripe.</small></span><em>Choisir →</em></button></div></> : <div className="providerCheckout"><button className="backChoice" onClick={() => setStep('method')}>← Changer de moyen</button>{provider === 'orange_money_manual' ? <><div className="providerTitle"><i className="orangeLogo">↗↙</i><div><span>PAIEMENT ORANGE MONEY</span><h2>{selected?.name ?? 'Abonnement StockMaster'}</h2></div></div><label>Numéro à créditer<input value={orangeMoney.number || 'Non configuré'} readOnly/></label><label>Nom du compte<input value={orangeMoney.name} readOnly/></label><label>Référence de la transaction<input value={reference} onChange={event => setReference(event.target.value)} placeholder="Ex. OM-483921"/></label><label>Justificatif (optionnel)<div className="fileInput"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setProof(event.target.files?.[0] ?? null)}/><span>{proof?.name ?? 'Choisir une capture'}</span></div></label><div className="orangeNotice">Vous recevrez une notification après vérification du paiement.</div></> : <><div className="providerTitle"><i className="bankCard">••</i><div><span>PAIEMENT PAR CARTE</span><h2>Paiement traité par Stripe</h2></div></div><p className="secureCopy">Vous serez redirigé vers la page de paiement hébergée par Stripe. StockMaster ne reçoit pas le numéro complet de votre carte.</p></>}<button className="primaryButton full" onClick={() => void pay()}>{provider === 'stripe' ? 'Continuer vers Stripe →' : 'Soumettre le paiement →'}</button></div>}</section><aside className="panel orderSummary"><span className="eyebrow">Récapitulatif</span><h2>{selected?.name ?? 'Forfait'}</h2><p>{selected?.description}</p><div><span>Montant</span><b>{quote ? money(quote.base_amount, quote.currency) : selected ? money(cycle === 'annual' ? selected.annual_price : selected.monthly_price, selected.currency) : '—'}</b></div>{quote && <><div><span>Réduction</span><b className="discount">- {money(quote.discount_amount, quote.currency)}</b></div><hr/><div className="total"><span>Total</span><b>{money(quote.final_amount, quote.currency)}</b></div></>}<small>✓ Montant confirmé avant paiement<br/>✓ Activation après confirmation du serveur<br/>✓ Reçu PDF après paiement confirmé</small></aside></div></>;
}

function History({ payments, status, setStatus, period, setPeriod, company }: { payments: Payment[]; status: string; setStatus: (value: string) => void; period: string; setPeriod: (value: string) => void; company: Company }) {
  const[query,setQuery]=useState('');const visible=payments.filter(payment=>`${payment.provider_reference??''} ${payment.plan?.name??''} ${payment.provider}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <><PageTitle title="Historique des paiements" subtitle="Consultez toutes vos opérations et téléchargez leurs reçus."/><div className="filterBar"><div className="webSearch"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une référence ou un forfait"/>{query&&<button onClick={()=>setQuery('')} aria-label="Effacer la recherche">×</button>}</div><select value={period} onChange={event => setPeriod(event.target.value)}><option value="all">Toutes les périodes</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option><option value="365">Cette année</option></select><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="processing">En attente</option><option value="succeeded">Payés</option><option value="failed">Refusés</option></select>{(query||period!=='all'||status!=='all')&&<button className="secondaryButton" onClick={()=>{setQuery('');setPeriod('all');setStatus('all')}}>Réinitialiser</button>}</div><section className="panel dataPanel"><PaymentTable payments={visible} company={company}/></section></>;
}

function Invoices({ payments, company }: { payments: Payment[]; company: Company }) {
  const receipts = payments.filter(payment => payment.status === 'succeeded');const pager=useStoredPage('receipts',receipts.length);const visible=receipts.slice(pager.start,pager.end); return <><PageTitle title="Reçus de paiement" subtitle="Téléchargez vos justificatifs de paiement d’abonnement au format PDF."/><section className="panel dataPanel"><div className="panelHead"><div><span>DOCUMENTS</span><h2>{receipts.length} reçu(s) disponible(s)</h2></div></div>{receipts.length ? <><div className="tableWrap"><table><thead><tr><th>N° reçu</th><th>Date</th><th>Forfait</th><th>Montant</th><th>Statut</th><th>Télécharger</th></tr></thead><tbody>{visible.map(payment => <tr key={payment.id}><td><b>PAY-{payment.id.slice(0,8).toUpperCase()}</b></td><td>{formatDate(payment.created_at)}</td><td>{payment.plan?.name ?? 'StockMaster'}</td><td><b>{money(payment.amount, payment.currency)}</b></td><td><Badge value={payment.status}/></td><td><button className="downloadButton" onClick={() => receipt(payment, company)}>⇩ PDF</button></td></tr>)}</tbody></table></div><Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/></> : <Empty icon="▧" title="Aucun reçu" text="Un reçu sera disponible après votre premier paiement confirmé."/>}</section></>;
}

function PaymentTable({ payments, company }: { payments: Payment[]; company: Company }) {const pager=useStoredPage('payments',payments.length);const visible=payments.slice(pager.start,pager.end);return payments.length ? <><div className="tableWrap"><table><thead><tr><th>Date</th><th>Méthode</th><th>Référence</th><th>Forfait</th><th>Montant</th><th>Statut</th><th></th></tr></thead><tbody>{visible.map(payment => <tr key={payment.id}><td>{formatDate(payment.created_at)}</td><td><span className="method"><i>{payment.provider === 'stripe' ? 'CB' : 'OM'}</i>{payment.provider === 'stripe' ? 'Carte bancaire' : 'Orange Money'}</span></td><td>{payment.provider_reference ?? '—'}</td><td>{payment.plan?.name ?? 'StockMaster'}</td><td><b>{money(payment.amount, payment.currency)}</b></td><td><Badge value={payment.status}/></td><td><button className="downloadButton" onClick={() => receipt(payment, company)}>PDF</button></td></tr>)}</tbody></table></div><Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/></> : <Empty icon="▤" title="Aucun paiement" text="Aucune opération ne correspond à ces filtres."/>; }

function CompanyPage({ company, setCompany, save }: { company: Company; setCompany: (company: Company) => void; save: () => Promise<void> }) { return <><PageTitle title="Informations de l’entreprise" subtitle="Gardez vos coordonnées administratives à jour."/><section className="panel companyPanel"><div className="companyIdentity"><i>{company.name.slice(0,2).toUpperCase() || 'SM'}</i><div><span>ENTREPRISE</span><h2>{company.name || 'Votre entreprise'}</h2><p>Devise principale : <b>{company.default_currency_code}</b></p></div></div><div className="formGrid"><label>Nom de l’entreprise<input value={company.name} onChange={event => setCompany({ ...company, name: event.target.value })}/></label><label>Email professionnel<input type="email" value={company.email ?? ''} onChange={event => setCompany({ ...company, email: event.target.value })}/></label><label>Téléphone<input value={company.phone ?? ''} onChange={event => setCompany({ ...company, phone: event.target.value })}/></label><label>Devise<input value={company.default_currency_code} readOnly/></label><label className="wide">Adresse<input value={company.address ?? ''} onChange={event => setCompany({ ...company, address: event.target.value })}/></label></div><button className="primaryButton" onClick={() => void save()}>Enregistrer les informations</button></section></>;
}

function UsersPage({ context, employees, roles, stores, open, setOpen, reload, notify, fail }: { context: UserContext; employees: Employee[]; roles: Role[]; stores: Store[]; open: boolean; setOpen: (value: boolean) => void; reload: () => Promise<void>; notify: (value: string) => void; fail: (value: string) => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', roleId: '', storeId: '', allStores: true }); const [busy, setBusy] = useState(false); const [updating, setUpdating] = useState('');
  const pager=useStoredPage('users',employees.length);const visibleEmployees=employees.slice(pager.start,pager.end);
  useEffect(() => { if (!form.roleId && roles[0]) setForm(current => ({ ...current, roleId: roles[0].id })); }, [roles, form.roleId]);
  async function invite(event: React.FormEvent) { event.preventDefault(); setBusy(true); const employeeEmail=form.email.trim().toLowerCase(); const result = await supabase.functions.invoke('invite-employee', { body: { fullName: form.fullName.trim(), email: employeeEmail, roleId: form.roleId, storeIds: form.allStores ? [] : [form.storeId], allStores: form.allStores, companyId: context.company_id } }); setBusy(false); if (result.error || result.data?.error) { fail(result.data?.error ?? await edgeErrorMessage(result.error) ?? 'Création impossible.'); return; } setOpen(false); setForm({ fullName: '', email: '', roleId: roles[0]?.id ?? '', storeId: '', allStores: true }); if(result.data?.reactivated)notify('Employé réactivé avec les nouveaux accès.');else if(result.data?.temporaryPassword){window.prompt('Copiez maintenant le mot de passe temporaire de '+employeeEmail+'. Il ne sera plus affiché.',result.data.temporaryPassword);notify('Employé créé. Le mot de passe devra être changé à la première connexion.');}else notify('Invitation envoyée par email.'); await reload(); }
  async function toggle(employee: Employee) { const storeIds = employee.all_stores ? [] : employeeStoreIds(employee); if (!employee.role_id) { fail('Le rôle actuel de cet utilisateur est introuvable.'); return; } if (!employee.all_stores && !storeIds.length) { fail('Aucune boutique valide n’est attribuée à cet utilisateur.'); return; } setUpdating(employee.id); const result = await supabase.rpc('update_employee_access', { p_membership_id: employee.id, p_role_id: employee.role_id, p_store_ids: storeIds, p_all_stores: employee.all_stores, p_is_active: !employee.is_active }); setUpdating(''); if (result.error) fail(result.error.message); else { notify('Accès utilisateur mis à jour sans modifier ses boutiques.'); await reload(); } }
  return <><PageTitle title="Utilisateurs de l’entreprise" subtitle="Invitez votre équipe et contrôlez ses accès." action={<button className="primaryButton" onClick={() => setOpen(true)}>+ Ajouter un utilisateur</button>}/><section className="panel dataPanel">{employees.length ? <><div className="tableWrap"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Boutique</th><th>Statut</th><th>Ajouté le</th><th>Action</th></tr></thead><tbody>{visibleEmployees.map(employee => <tr key={employee.id}><td><span className="userCell"><i>{(employee.profile?.full_name ?? 'E')[0]}</i><b>{employee.profile?.full_name ?? 'Employé'}</b></span></td><td>{employee.role?.name ?? 'Employé'}</td><td>{employee.all_stores ? 'Toutes les boutiques' : employee.store?.name ?? '—'}</td><td><Badge value={employee.is_active ? 'active' : 'inactive'}/></td><td>{formatDate(employee.created_at)}</td><td><button className="downloadButton" disabled={updating === employee.id} onClick={() => void toggle(employee)}>{updating === employee.id ? 'Mise à jour…' : employee.is_active ? 'Désactiver' : 'Réactiver'}</button></td></tr>)}</tbody></table></div><Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/></> : <Empty icon="♧" title="Aucun employé" text="Ajoutez votre premier utilisateur pour commencer à travailler en équipe."/>}</section>{open && <Modal title="Ajouter un utilisateur" close={() => setOpen(false)}><form className="modalForm" onSubmit={event => void invite(event)}><div className="alert success">Le mot de passe temporaire sera affiché une seule fois après la création. L’employé devra le remplacer à sa première connexion.</div><label>Nom complet<input required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })}/></label><label>Adresse email<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label><label>Rôle<select required value={form.roleId} onChange={event => setForm({ ...form, roleId: event.target.value })}>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label><label className="toggleLabel"><span>Toutes les boutiques<small>L’employé accède à tous les points de vente.</small></span><input type="checkbox" checked={form.allStores} onChange={event => setForm({ ...form, allStores: event.target.checked })}/></label>{!form.allStores && <label>Boutique<select required value={form.storeId} onChange={event => setForm({ ...form, storeId: event.target.value })}><option value="">Choisir</option>{stores.map(store => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>}<button className="primaryButton" disabled={busy}>{busy ? 'Création…' : 'Créer l’employé'}</button></form></Modal>}</>;
}

function SecurityPage({ events, resetPassword, logoutAll, notify, fail }: { events: SecurityEvent[]; resetPassword: () => Promise<void>; logoutAll: () => Promise<void>; notify: (value: string) => void; fail: (value: string) => void }) {
  const [mfaActive, setMfaActive] = useState(false); const [factorId, setFactorId] = useState(''); const [qr, setQr] = useState(''); const [code, setCode] = useState('');
  const pager = useStoredPage('security-events', events.length);
  const visibleEvents = events.slice(pager.start, pager.end);
  useEffect(() => { supabase.auth.mfa.listFactors().then(({ data }) => { const verified = data?.totp.find(item => item.status === 'verified'); setMfaActive(!!verified); if (verified) setFactorId(verified.id); }); }, []);
  async function beginMfa() { const result = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'StockMaster Compte' }); if (result.error) fail(result.error.message); else { setFactorId(result.data.id); setQr(result.data.totp.qr_code); } }
  async function verifyMfa() { const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() }); if (result.error) fail(result.error.message); else { setMfaActive(true); setQr(''); setCode(''); notify('Authentification à deux facteurs activée.'); } }
  async function removeMfa() { if (!confirm('Désactiver l’authentification à deux facteurs ?')) return; const result = await supabase.auth.mfa.unenroll({ factorId }); if (result.error) fail(result.error.message); else { setMfaActive(false); setFactorId(''); notify('Authentification à deux facteurs désactivée.'); } }
  return <><PageTitle title="Sécurité du compte" subtitle="Protégez votre accès et surveillez les connexions."/><section className="panel securityPanel"><SecurityRow icon="♙" title="Mot de passe" subtitle="Recevez un lien sécurisé par email" action="Changer" onClick={() => void resetPassword()}/><SecurityRow icon="◎" title="Authentification à deux facteurs" subtitle={mfaActive ? 'Activée sur votre compte' : 'Recommandée pour protéger votre compte'} action={mfaActive ? 'Désactiver' : 'Activer'} good={mfaActive} onClick={() => mfaActive ? void removeMfa() : void beginMfa()}/><SecurityRow icon="▣" title="Appareils connectés" subtitle={`${Math.max(1, new Set(events.map(event => event.device_label)).size)} appareil(s) détecté(s)`} action="Voir" onClick={() => document.getElementById('security-events')?.scrollIntoView({ behavior: 'smooth' })}/><SecurityRow icon="↪" title="Sessions actives" subtitle="Déconnecter les autres appareils" action="Tout déconnecter" onClick={() => void logoutAll()}/></section>{qr && <section className="panel mfaSetup"><div><span className="eyebrow">CONFIGURATION 2FA</span><h2>Scannez le QR code</h2><p>Utilisez Google Authenticator ou une application compatible, puis saisissez le code à 6 chiffres.</p></div><img src={qr} alt="QR code MFA"/><div className="inlineField"><input inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g,''))} placeholder="000000"/><button onClick={() => void verifyMfa()}>Vérifier</button></div></section>}<section id="security-events" className="panel eventPanel"><div className="panelHead"><div><span>JOURNAL DE SÉCURITÉ</span><h2>Activité récente</h2></div></div>{events.length ? <>{visibleEvents.map(event => <div className="eventRow" key={event.id}><i>✓</i><span><b>{event.event_type.replaceAll('_',' ')}</b><small>{event.device_label ?? 'Appareil StockMaster'}</small></span><time>{formatDateTime(event.created_at)}</time></div>)}<Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/></> : <Empty icon="◉" title="Aucun événement" text="Les actions de sécurité apparaîtront ici."/>}</section></>;
}

function SecurityRow({ icon, title, subtitle, action, good, onClick }: { icon: string; title: string; subtitle: string; action: string; good?: boolean; onClick: () => void }) { return <div className="securityRow"><i>{icon}</i><span><b>{title}</b><small>{subtitle}</small></span>{good && <Badge value="active"/>}<button onClick={onClick}>{action}</button></div>; }

function SupportPage({ context, tickets, open, setOpen, reload, notify, fail }: { context: UserContext; tickets: Ticket[]; open: boolean; setOpen: (value: boolean) => void; reload: () => Promise<void>; notify: (value: string) => void; fail: (value: string) => void }) {
  const [form, setForm] = useState({ subject: '', description: '', priority: 'normal' }); const [busy, setBusy] = useState(false);
  const pager = useStoredPage('support-tickets', tickets.length, 6);
  const visibleTickets = tickets.slice(pager.start, pager.end);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!context.company_id) return; setBusy(true); const result = await supabase.rpc('create_support_ticket', { p_company_id: context.company_id, p_subject: form.subject.trim(), p_description: form.description.trim(), p_priority: form.priority }); setBusy(false); if (result.error) fail(result.error.message); else { notify('Votre demande de support a été envoyée.'); setForm({ subject: '', description: '', priority: 'normal' }); setOpen(false); await reload(); } }
  return <><PageTitle title="Mes demandes de support" subtitle="Suivez vos demandes et contactez l’équipe StockMaster." action={<button className="primaryButton" onClick={() => setOpen(true)}>+ Nouvelle demande</button>}/><div className="ticketGrid">{visibleTickets.map(ticket => <article className="panel ticketCard" key={ticket.id}><div><span className={`priority ${ticket.priority}`}>{ticket.priority}</span><Badge value={ticket.status}/></div><h3>{ticket.subject}</h3><p>{ticket.description}</p><footer><span>#{ticket.id.slice(0,8).toUpperCase()}</span><time>{formatDate(ticket.created_at)}</time></footer>{ticket.resolution && <div className="resolution"><b>Réponse StockMaster</b>{ticket.resolution}</div>}</article>)}{!tickets.length && <div className="panel"><Empty icon="◌" title="Aucune demande" text="Créez une demande si vous avez besoin de notre équipe."/></div>}</div><Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/>{open && <Modal title="Créer une demande" close={() => setOpen(false)}><form className="modalForm" onSubmit={event => void submit(event)}><label>Sujet<input required minLength={3} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} placeholder="Ex. Problème de paiement"/></label><label>Priorité<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option value="low">Faible</option><option value="normal">Normale</option><option value="high">Élevée</option><option value="urgent">Urgente</option></select></label><label>Description<textarea required minLength={10} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Décrivez votre problème en détail..."/></label><button className="primaryButton" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer la demande →'}</button></form></Modal>}</>;
}

function NotificationsPage({ items, markAll }: { items: Notification[]; markAll: () => Promise<void> }) {
  const pager = useStoredPage('notifications', items.length);
  const visibleItems = items.slice(pager.start, pager.end);
  return <><PageTitle title="Notifications" subtitle="Les notifications sont supprimées automatiquement après 48 heures." action={<button className="secondaryButton" onClick={() => void markAll()}>Tout marquer comme lu</button>}/><section className="panel notificationsPanel">{visibleItems.map(item => <article className={!item.read_at ? 'unread' : ''} key={item.id}><i>{item.type.includes('payment') ? '▤' : item.type.includes('subscription') ? '✓' : '♢'}</i><span><b>{item.title}</b><p>{item.body}</p></span><time>{formatDateTime(item.created_at)}</time></article>)}{!items.length && <Empty icon="♢" title="Aucune notification" text="Vous êtes à jour. Les nouvelles informations apparaîtront ici."/>}<Pagination page={pager.page} total={pager.total} setPage={pager.setPage}/></section></>;
}

function ProfilePage({ initials, fullName, setFullName, email, company, setCompany, editing, setEditing, save }: { initials: string; fullName: string; setFullName: (value: string) => void; email: string; company: Company; setCompany: (company: Company) => void; editing: boolean; setEditing: (value: boolean) => void; save: () => Promise<void> }) { return <><PageTitle title="Mon profil" subtitle="Vos informations personnelles de propriétaire."/><section className="panel profilePanel"><div className="profileIdentity"><i>{initials}</i><span><small>PROPRIÉTAIRE</small><h2>{fullName || 'Administrateur'}</h2><p>{email}</p><p>{company.phone || 'Téléphone non renseigné'}</p></span></div>{editing ? <div className="profileForm"><label>Nom complet<input value={fullName} onChange={event => setFullName(event.target.value)}/></label><label>Téléphone<input value={company.phone ?? ''} onChange={event => setCompany({ ...company, phone: event.target.value })}/></label><div><button className="secondaryButton" onClick={() => setEditing(false)}>Annuler</button><button className="primaryButton" onClick={() => void save()}>Enregistrer</button></div></div> : <button className="secondaryButton full" onClick={() => setEditing(true)}>Modifier le profil</button>}</section></>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="modalBackdrop"><section className="modal"><header><div><span>STOCKMASTER</span><h2>{title}</h2></div><button onClick={close} aria-label="Fermer">×</button></header>{children}</section></div>; }

function receipt(payment: Payment, company: Company) {
  const popup = window.open('', '_blank', 'width=760,height=900');
  if (!popup) { window.alert('La fenêtre du PDF a été bloquée. Autorisez les fenêtres contextuelles pour StockMaster.'); return; }
  const values = {
    status: escapeHtml(statusLabel(payment.status)), company: escapeHtml(company.name), date: escapeHtml(formatDate(payment.created_at)), contact: escapeHtml([company.address, company.phone, company.email].filter(Boolean).join(' • ')), logo: escapeHtml(company.logo_url ?? ''), footer: escapeHtml(company.receipt_footer ?? ''),
    invoice: escapeHtml(`PAY-${payment.id.slice(0,8).toUpperCase()}`), plan: escapeHtml(payment.plan?.name ?? 'StockMaster'),
    method: payment.provider === 'stripe' ? 'Carte bancaire' : 'Orange Money', reference: escapeHtml(payment.provider_reference ?? '—'),
    total: escapeHtml(money(payment.amount, payment.currency)),
  };
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Reçu de paiement StockMaster</title><style>body{font-family:Arial,sans-serif;color:#183733;padding:48px}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #087a59;padding-bottom:22px}.identity{display:flex;align-items:center;gap:16px}.companyLogo{width:64px;height:64px;object-fit:contain;border-radius:12px}.logo{font-size:28px;font-weight:900;color:#087a59}.contact{margin-top:7px;color:#607775;font-size:12px}.badge{height:fit-content;background:#dff4ed;color:#087a59;padding:8px 12px;border-radius:99px;font-weight:800}.box{margin-top:30px;border:1px solid #dce7e2;border-radius:16px;padding:24px}.row{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid #edf3f0}.row strong{text-align:right}.total{font-size:22px;font-weight:900;color:#087a59}.foot{margin-top:38px;color:#607775;text-align:center;line-height:1.65}button{margin-top:25px;padding:12px 18px;border:0;border-radius:8px;background:#087a59;color:#fff;font-weight:bold}@media print{button{display:none}body{padding:20px}}</style></head><body><div class="head"><div class="identity">${values.logo ? `<img class="companyLogo" src="${values.logo}" alt="Logo de l'entreprise">` : ''}<div><div class="logo">${values.company}</div><small>Reçu de paiement d'abonnement StockMaster</small>${values.contact ? `<div class="contact">${values.contact}</div>` : ''}</div></div><span class="badge">${values.status}</span></div><div class="box"><div class="row"><span>Entreprise</span><strong>${values.company}</strong></div><div class="row"><span>Date</span><strong>${values.date}</strong></div><div class="row"><span>Reçu</span><strong>${values.invoice}</strong></div><div class="row"><span>Forfait</span><strong>${values.plan}</strong></div><div class="row"><span>Méthode</span><strong>${values.method}</strong></div><div class="row"><span>Référence</span><strong>${values.reference}</strong></div><div class="row total"><span>Total payé</span><strong>${values.total}</strong></div></div><p class="foot">${values.footer ? `${values.footer}<br>` : ''}Ce document atteste le paiement enregistré. Il ne constitue pas une facture fiscale tant que les mentions fiscales de l'émetteur ne sont pas complétées.<br>Document généré par StockMaster</p><button onclick="window.print()">Imprimer ou enregistrer en PDF</button></body></html>`); popup.document.close();
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
