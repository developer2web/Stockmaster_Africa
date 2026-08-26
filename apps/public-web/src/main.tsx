import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, getContext, signIn, supabase } from '../../shared/supabase';
import './style.css';
import '../../shared/ux.css';

type AuthMode = 'login' | 'register';
type PlanCode = 'basic' | 'pro' | 'business';
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || '';
const legalAddress = import.meta.env.VITE_LEGAL_ADDRESS?.trim() || '';

const features = [
  { icon: '▦', title: 'Gestion des ventes', text: 'Enregistrez rapidement chaque vente et générez des reçus professionnels.' },
  { icon: '▤', title: 'Gestion du stock', text: 'Suivez vos produits en temps réel et recevez des alertes de rupture.' },
  { icon: '♙', title: 'Paiements & fournisseurs', text: 'Suivez les encaissements, dépenses et paiements Orange Money.' },
  { icon: '♧', title: 'Clients & utilisateurs', text: 'Gérez vos clients, fournisseurs et l’accès de vos employés en sécurité.' },
  { icon: '↗', title: 'Rapports & statistiques', text: 'Prenez des décisions éclairées grâce à des rapports détaillés.' },
  { icon: '▦', title: 'Multi-boutiques', text: 'Gérez plusieurs boutiques depuis un seul compte StockMaster.' },
];

const solutions = [
  { icon: '◌', title: 'Boutiques', text: 'Gérez vos ventes et votre stock en toute simplicité.', theme: 'boutique' },
  { icon: '♙', title: 'Commerces multi-boutiques', text: 'Séparez les stocks, équipes et opérations de chaque point de vente.', theme: 'market' },
  { icon: '✚', title: 'Commerce de gros', text: 'Suivez les approvisionnements, fournisseurs et dettes à payer.', theme: 'pharmacy' },
  { icon: '▱', title: 'Équipes de vente', text: 'Attribuez les accès par rôle, permission et boutique.', theme: 'restaurant' },
];

type PublicPlan = { code: PlanCode; name: string; price: string; description: string; features: string[] };
type PublicPlanRow = { code: string; name: string; description: string; monthly_price: number; currency: string; max_businesses: number; max_stores: number; max_employees: number; feature_keys: string[] };
const fallbackPlans: PublicPlan[] = [
  { code: 'basic', name: 'Basic', price: 'Tarif à confirmer', description: 'Les outils essentiels pour une boutique.', features: ['14 jours d’essai · Orange Money et Stripe', 'Web ordinateur, mobile et mode hors ligne', 'Alertes de stock faible et dettes clients', '1 boutique · 2 employés'] },
  { code: 'pro', name: 'Pro', price: 'Tarif à confirmer', description: 'Pour développer plusieurs points de vente.', features: ['Tout Basic', 'Dettes fournisseurs et clôture avancée', 'Transferts entre boutiques', 'Jusqu’à 5 boutiques · 15 employés'] },
  { code: 'business', name: 'Business', price: 'Tarif à confirmer', description: 'Pour les groupes et contrôles avancés.', features: ['Tout Pro', 'Gestion de plusieurs entreprises', 'Jusqu’à 10 entreprises', '20 boutiques · 100 employés'] },
];

const commercialFeatures = (code: PlanCode, businesses: number, stores: number, employees: number) => code === 'basic'
  ? ['14 jours d’essai · Orange Money et Stripe', 'Web ordinateur, mobile et mode hors ligne', 'Alertes de stock faible et dettes clients', `${stores} boutique · ${employees} employés`]
  : code === 'pro'
    ? ['Tout Basic', 'Dettes fournisseurs et clôture avancée', 'Transferts entre boutiques', `Jusqu’à ${stores} boutiques · ${employees} employés`]
    : ['Tout Pro', 'Gestion de plusieurs entreprises', `Jusqu’à ${businesses} entreprises`, `${stores} boutiques · ${employees} employés`];

const useCases = [
  { quote: 'Centraliser les ventes, le stock et la caisse d’une boutique dans un même espace.', name: 'Commerce de proximité', role: 'Exemple d’utilisation', initials: 'CP' },
  { quote: 'Comparer les boutiques et contrôler les accès des équipes selon leur rôle.', name: 'Entreprise multi-boutiques', role: 'Exemple d’utilisation', initials: 'MB' },
  { quote: 'Suivre les créances clients, les dettes fournisseurs et les échéances.', name: 'Gestion administrative', role: 'Exemple d’utilisation', initials: 'GA' },
];

const questions = [
  ['Qu’est-ce que StockMaster ?', 'StockMaster est une plateforme tout-en-un pour gérer ventes, stocks, caisse, clients, fournisseurs, employés et rapports depuis le web ou le mobile.'],
  ['Puis-je l’utiliser hors ligne ?', 'Les ventes et dépenses compatibles peuvent être placées dans une file locale puis synchronisées lorsque la connexion revient. Les autres opérations nécessitent Internet.'],
  ['Comment mes données sont-elles protégées ?', 'StockMaster applique des contrôles d’accès par entreprise, boutique, rôle et permission, ainsi que des journaux de sécurité. Aucun service en ligne ne peut toutefois garantir un risque nul.'],
  ['Comment fonctionne le paiement ?', 'Vous pouvez régler votre abonnement par Orange Money ou par carte via Stripe. Le forfait est activé seulement après confirmation du paiement par le serveur.'],
  ['Puis-je changer de plan plus tard ?', 'Oui. Vous pouvez changer de forfait depuis votre espace Compte selon l’évolution de votre activité.'],
];

function destinations() {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /^192\.168\./.test(location.hostname);
  return {
    admin: local ? `${location.protocol}//${location.hostname}:4002` : (import.meta.env.VITE_ADMIN_URL || 'https://admin.stockmaster.com'),
    account: local ? `${location.protocol}//${location.hostname}:4001` : (import.meta.env.VITE_ACCOUNT_URL || 'https://account.stockmaster.com'),
    app: local ? `${location.protocol}//${location.hostname}:8081` : (import.meta.env.VITE_APP_URL || 'https://app.stockmaster.com'),
  };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <a className={`brand ${compact ? 'compact' : ''}`} href="#top" aria-label="StockMaster - Accueil"><span className="brandMark">S<i>↗</i><b>▰</b></span><strong>Stock<span>Master</span></strong></a>;
}

function DashboardMockup({ compact = false }: { compact?: boolean }) {
  return <div className={`dashboardMockup ${compact ? 'compact' : ''}`} aria-label="Aperçu du tableau de bord StockMaster">
    <aside><Brand compact/><span className="mockActive">▦ <i>Tableau de bord</i></span>{['Ventes', 'Produits', 'Clients', 'Paiements', 'Rapports'].map(item => <span key={item}>○ <i>{item}</i></span>)}</aside>
    <div className="mockBody">
      <div className="mockHead"><div><small>Boutique principale</small><b>Tableau de bord</b></div><span>MD</span></div>
      <div className="mockKpis"><article><small>Ventes du jour</small><b>2 006 000 <i>GNF</i></b><em>+18,4%</em></article><article><small>Transactions</small><b>147</b><em>+8,1%</em></article><article><small>Produits</small><b>1 284</b><em>Actifs</em></article><article><small>Stock faible</small><b className="danger">12</b><em>À traiter</em></article></div>
      <div className="mockContent"><article><div><b>Évolution des ventes</b><small>7 derniers jours</small></div><div className="lineChart"><span/><span/><span/><span/><span/><span/><span/></div></article><article className="mockSales"><b>Ventes récentes</b>{['Awa Camara', 'Fanta Diallo', 'Ibrahima Barry', 'Mariam Sylla'].map((name, index) => <p key={name}><i>{name.slice(0, 1)}</i><span>{name}<small>#{4820 + index}</small></span><b>{[245, 180, 325, 95][index]}K</b></p>)}</article></div>
    </div>
  </div>;
}

function PhoneMockup({ screen = 'dashboard', tilted = false }: { screen?: 'dashboard' | 'sales'; tilted?: boolean }) {
  return <div className={`phoneMockup ${tilted ? 'tilted' : ''}`}><div className="notch"/><div className="phoneTop"><Brand compact/><span>●</span></div>{screen === 'dashboard' ? <><small>Ventes du jour</small><h3>2 006 000 <i>GNF</i></h3><div className="phoneKpis"><span><b>147</b>Transactions</span><span><b>1 284</b>Produits</span><span><b>12</b>Alertes</span></div><div className="phoneChart"><i/><i/><i/><i/><i/><i/><i/></div><div className="phoneRows"><b>Activité récente</b><span>Vente #4821 <em>325 000</em></span><span>Paiement reçu <em>180 000</em></span></div></> : <><small>Ventes du jour</small><h3>12 450 000 <i>GNF</i></h3><div className="phoneRows sales"><b>Transactions récentes</b>{['Fanta Diallo', 'Alpha Market', 'Barry Pharma', 'Client comptoir'].map((name, index) => <span key={name}>{name}<em>{[260, 415, 95, 180][index]} 000</em></span>)}</div></>}<nav><i>⌂</i><i>▤</i><i>▦</i><i>☷</i></nav></div>;
}

function App() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>('pro');
  const [displayPlans, setDisplayPlans] = useState<PublicPlan[]>(fallbackPlans);
  const [menuOpen, setMenuOpen] = useState(false);
  const openAuth = (mode: AuthMode, plan: PlanCode = selectedPlan) => { setSelectedPlan(plan); setAuth(mode); setMenuOpen(false); };

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, []);

  useEffect(() => {
    if (!configured) return;
    void supabase.rpc('list_public_plans').then(({ data }) => {
      const rows = (data ?? []) as PublicPlanRow[];
      const supported = rows.filter((plan) => ['basic', 'pro', 'premium', 'business'].includes(String(plan.code)));
      if (!supported.length) return;
      setDisplayPlans(supported.map((plan) => ({
        code: (plan.code === 'premium' ? 'business' : plan.code) as PlanCode,
        name: plan.code === 'premium' ? 'Business' : String(plan.name),
        description: String(plan.description || 'Offre StockMaster'),
        price: `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(plan.monthly_price))} ${String(plan.currency)}`,
        features: commercialFeatures((plan.code === 'premium' ? 'business' : plan.code) as PlanCode, Number(plan.max_businesses), Number(plan.max_stores), Number(plan.max_employees)),
      })));
    });
  }, []);

  return <div id="top" className="marketingSite">
    <header className="siteHeader"><Brand/><button className="menuButton" onClick={() => setMenuOpen(value => !value)} aria-label="Ouvrir le menu">{menuOpen ? '×' : '☰'}</button><nav className={menuOpen ? 'open' : ''}><a href="#features">Fonctionnalités</a><a href="#solutions">Solutions</a><a href="#pricing">Tarifs</a><a href="#about">À propos</a><a href="#faq">FAQ</a></nav><div className="headerActions"><button className="linkButton" onClick={() => openAuth('login')}>Se connecter</button><button className="primaryButton small" onClick={() => openAuth('register')}>Commencer</button></div></header>

    <main>
      <section className="hero sectionShell">
        <div className="heroCopy"><span className="kicker"><i>✓</i> La gestion simple et puissante</span><h1>Gérez votre commerce.<br/><em>Maîtrisez votre croissance.</em></h1><p>StockMaster réunit ventes, stock, clients, paiements et rapports dans une même plateforme.</p><div className="heroActions"><button className="primaryButton" onClick={() => openAuth('register')}>Découvrir les offres <b>→</b></button><a className="secondaryButton" href="#product">Voir la démo <span>▶</span></a></div><div className="trustPoints"><span>✓ Rôles et permissions</span><span>✓ Journal de sécurité</span>{supportEmail && <span>✓ Assistance par email</span>}<span>✓ Web et mobile</span></div></div>
        <div className="heroVisual"><div className="glow"/><DashboardMockup/><PhoneMockup/></div>
      </section>

      <section className="trusted"><p>Une plateforme pensée pour les opérations quotidiennes</p><div>{['Ventes', 'Stock', 'Caisse', 'Fournisseurs', 'Rapports'].map((name, index) => <span key={name}><i>{['⌁', '▣', '◎', '♧', '◉'][index]}</i>{name}</span>)}</div></section>

      <section id="features" className="contentSection softSection"><SectionHeading eyebrow="Fonctionnalités" title="Toutes les fonctionnalités dont vous avez besoin, au même endroit" text="StockMaster centralise toutes les opérations de votre entreprise pour vous faire gagner du temps et augmenter vos profits."/><div className="featureGrid">{features.map(feature => <article key={feature.title}><i className="iconBox">{feature.icon}</i><h3>{feature.title}</h3><p>{feature.text}</p><a href="#product">Découvrir <span>→</span></a></article>)}</div><div className="center"><a className="primaryButton" href="#product">Découvrir toutes les fonctionnalités</a></div></section>

      <section id="product" className="contentSection productOverview"><SectionHeading eyebrow="Aperçu du produit" title="Un logiciel puissant et simple à utiliser" text="Découvrez une interface moderne conçue pour organiser votre travail."/><div className="desktopFrame"><div className="browserBar"><i/><i/><i/><span>app.stockmaster.com</span></div><DashboardMockup compact/></div><div className="productBenefits"><article><i>▣</i><h3>Tableau de bord intuitif</h3><p>Vos données clés en un coup d’œil.</p></article><article><i>◉</i><h3>Accès rapide</h3><p>Naviguez entre les fonctionnalités autorisées.</p></article><article><i>♢</i><h3>Mesures de sécurité</h3><p>Authentification, permissions et journalisation sont intégrées.</p></article></div></section>

      <section id="solutions" className="contentSection softSection"><SectionHeading eyebrow="Solutions par commerce" title="Une solution adaptée à chaque type de commerce" text="Que vous soyez une petite boutique ou une grande entreprise, StockMaster s’adapte à vos besoins."/><div className="solutionGrid">{solutions.map(solution => <article key={solution.title}><div className={`solutionArt ${solution.theme}`}><i>{solution.icon}</i><span/><span/><span/></div><div><i className="miniIcon">{solution.icon}</i><h3>{solution.title}</h3><p>{solution.text}</p></div></article>)}</div><div className="center"><button className="primaryButton" onClick={() => openAuth('register')}>Voir toutes les solutions</button></div></section>

      <section className="mobileFeature contentSection"><div><span className="sectionEyebrow">Application mobile Expo 54</span><h2>Gérez votre commerce depuis votre téléphone</h2><p>L’application mobile StockMaster couvre les ventes, le stock, la caisse et les opérations autorisées de chaque employé.</p><ul><li>Interface adaptée aux téléphones</li><li>Accès selon le rôle et les permissions</li><li>File hors ligne pour les opérations compatibles</li><li>Synchronisation après le retour du réseau</li></ul><p className="pricingNote">La disponibilité sur les boutiques d’applications sera annoncée uniquement après publication effective.</p></div><div className="phoneStage"><PhoneMockup/><PhoneMockup screen="sales" tilted/></div></section>

      <section id="pricing" className="contentSection softSection"><SectionHeading eyebrow="Tarifs" title="Des offres adaptées à votre activité" text="Choisissez le plan qui correspond à vos besoins."/><div className="pricingGrid">{displayPlans.map(plan => <article className={plan.code === 'pro' ? 'featured' : ''} key={plan.code}>{plan.code === 'pro' && <span className="popular">Offre intermédiaire</span>}<h3>{plan.name}</h3><p>{plan.description}</p><strong>{plan.price}{plan.price !== 'Tarif à confirmer' && <small>/ mois</small>}</strong><ul>{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul><button className={plan.code === 'pro' ? 'primaryButton' : 'secondaryButton'} onClick={() => openAuth('register', plan.code)}>Choisir {plan.name}</button></article>)}</div><p className="pricingNote">Le montant, la devise, les limites et l’éventuel essai présentés à la confirmation de commande font foi.</p></section>

      <section className="contentSection"><SectionHeading eyebrow="Cas d’usage" title="Une organisation adaptée à votre activité" text="Exemples de besoins couverts par StockMaster."/><div className="testimonialGrid">{useCases.map(item => <article key={item.name}><blockquote>{item.quote}</blockquote><div className="person"><i>{item.initials}</i><span><b>{item.name}</b><small>{item.role}</small></span></div></article>)}</div></section>

      <section id="about" className="contentSection aboutSection"><SectionHeading eyebrow="À propos de StockMaster" title="Notre mission : mieux organiser votre commerce" text="StockMaster est conçu pour accompagner la gestion quotidienne des entreprises africaines."/><div className="aboutGrid"><ul><li>Gestion multi-boutiques</li><li>Accès selon les rôles</li><li>Traçabilité des opérations</li><li>Assistance et documentation</li></ul><div className="teamVisual"><div className="teamCard"><i>SM</i><span><b>Une solution proche du terrain</b><small>Afrique francophone</small></span></div><p>Nous développons des outils adaptés aux besoins concrets des commerçants.</p></div></div><div className="aboutStats"><article><b>3</b><span>Espaces web spécialisés</span></article><article><b>2</b><span>Moyens de paiement proposés</span></article><article><b>Hors ligne</b><span>File de synchronisation mobile</span></article><article><b>Par rôle</b><span>Permissions configurables</span></article></div></section>

      <section id="faq" className="contentSection faqSection"><div><span className="sectionEyebrow">FAQ</span><h2>Questions fréquentes</h2><p>Trouvez rapidement des réponses à vos questions.</p><div className="accordion">{questions.map(([question, answer]) => <details key={question}><summary>{question}<i>+</i></summary><p>{answer}</p></details>)}</div>{supportEmail ? <a className="primaryButton" href="#contact">Contacter le support</a> : <a className="primaryButton" href="#features">Voir les fonctionnalités</a>}</div><div className="faqVisual"><i>?</i><i>?</i><div className="faqPerson"><span/><b/><em/></div></div></section>

      <ContactSection/>

      <section className="finalBanner"><div><span>Prêt à organiser votre commerce ?</span><h2>Découvrez l’offre disponible pour votre entreprise.</h2><p>Les conditions du forfait et de l’éventuel essai sont affichées avant validation.</p></div><button className="lightButton" onClick={() => openAuth('register')}>Créer mon espace →</button></section>
    </main>

    <footer className="siteFooter"><div><Brand/><p>La plateforme de gestion pour les commerces et leurs équipes.</p></div><div><b>Produit</b><a href="#features">Fonctionnalités</a><a href="#pricing">Tarifs</a><a href="#product">Application mobile</a></div><div><b>Informations</b><a href="/legal-notice/">Mentions légales</a><a href="/terms/">Conditions d’utilisation</a><a href="/privacy/">Confidentialité</a></div><div><b>Aide</b><a href="#faq">FAQ</a>{supportEmail && <a href={`mailto:${supportEmail}`}>Support</a>}<a href="/account-deletion/">Supprimer un compte</a></div><div className="footerBottom"><span>© 2026 StockMaster. Tous droits réservés.</span><span>Informations légales à compléter avant publication.</span></div></footer>

    {auth && <AuthModal mode={auth} initialPlan={selectedPlan} close={() => setAuth(null)} switchMode={setAuth}/>} 
  </div>;
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="sectionHeading"><span className="sectionEyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>;
}

function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  if (!supportEmail) return null;
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = `Nom : ${form.name}\nEmail : ${form.email}\nTéléphone : ${form.phone || 'Non renseigné'}\n\n${form.message}`;
    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <section id="contact" className="contentSection contactSection"><div><span className="sectionEyebrow">Contactez-nous</span><h2>Nous sommes là pour vous accompagner</h2><p>Une question, un besoin spécifique ? Notre équipe est à votre écoute.</p><ul><li><i>✉</i><span><b>Email</b>{supportEmail}</span></li>{legalAddress && <li><i>⌖</i><span><b>Adresse</b>{legalAddress}</span></li>}<li><i>◷</i><span><b>Réponse</b>Selon les horaires et la priorité de la demande</span></li></ul></div><form onSubmit={submit}><div><label>Nom complet<input required value={form.name} onChange={event => update('name', event.target.value)} placeholder="Votre nom"/></label><label>Email<input type="email" required value={form.email} onChange={event => update('email', event.target.value)} placeholder="vous@entreprise.com"/></label></div><div><label>Téléphone<input value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="Facultatif"/></label><label>Sujet<input required value={form.subject} onChange={event => update('subject', event.target.value)} placeholder="Comment pouvons-nous aider ?"/></label></div><label>Votre message<textarea required value={form.message} onChange={event => update('message', event.target.value)} placeholder="Décrivez votre besoin..."/></label><small>En envoyant ce message, vous acceptez que les informations saisies soient utilisées pour répondre à votre demande.</small>{sent && <p className="formSuccess">Votre application de messagerie a été ouverte avec le message préparé.</p>}<button className="primaryButton">Envoyer le message →</button></form></section>;
}

function AuthModal({ mode, initialPlan, close, switchMode }: { mode: AuthMode; initialPlan: PlanCode; close: () => void; switchMode: (mode: AuthMode) => void }) {
  const [values, setValues] = useState({ fullName: '', companyName: '', storeName: '', countryCode: 'GN', email: '', password: '', confirm: '', plan: initialPlan });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const update = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (!configured) throw new Error('La connexion Supabase n’est pas configurée.');
      if (mode === 'login') {
        await signIn(values.email, values.password);
        const context = await getContext();
        if (!context) throw new Error('Ce compte ne possède pas encore d’espace accessible.');
        const links = destinations();
        location.assign(context.role === 'super_admin' ? links.admin : context.role === 'company_admin' ? links.account : links.app);
      } else {
        if (!accepted) throw new Error('Vous devez accepter les conditions d’utilisation et la politique de confidentialité.');
        if (values.password.length < 10 || !/[A-Z]/.test(values.password) || !/[a-z]/.test(values.password) || !/[0-9]/.test(values.password) || !/[^A-Za-z0-9]/.test(values.password)) throw new Error('Le mot de passe doit contenir au moins 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.');
        if (values.password !== values.confirm) throw new Error('Les mots de passe ne correspondent pas.');
        const links = destinations();
        const { data, error: signUpError } = await supabase.auth.signUp({ email: values.email.trim().toLowerCase(), password: values.password, options: { emailRedirectTo: `${links.app}/(auth)/complete-profile`, data: { full_name: values.fullName.trim(), company_name: values.companyName.trim(), store_name: values.storeName.trim(), country_code: values.countryCode, selected_plan: values.plan === 'business' ? 'premium' : values.plan } } });
        if (signUpError) throw signUpError;
        if (data.user?.identities?.length === 0) throw new Error('Cette adresse email possède déjà un compte StockMaster.');
        if (data.session) {
          const { error: setupError } = await supabase.rpc('bootstrap_company', { p_company_name: values.companyName.trim(), p_store_name: values.storeName.trim(), p_country_code: values.countryCode });
          if (setupError) throw setupError;
          location.assign(links.app);
        } else setSuccess(`Nous avons envoyé un email de confirmation à ${values.email}. Ouvrez votre boîte mail pour confirmer votre adresse, puis choisissez votre essai ou abonnement.`);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Opération impossible. Réessayez.'); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    setError(''); setSuccess('');
    if (!values.email.trim()) { setError('Saisissez d’abord votre adresse email.'); return; }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email.trim(), { redirectTo: destinations().account });
    if (resetError) setError(resetError.message); else setSuccess('Un email sécurisé de réinitialisation vient de vous être envoyé.');
    setBusy(false);
  }

  return <div className="authBackdrop" onMouseDown={event => event.target === event.currentTarget && close()}><section className="authShell"><aside><Brand/><div><span>BIENVENUE SUR STOCKMASTER</span><h2>Gérez mieux.<br/>Grandissez plus vite.</h2><p>Connectez-vous à votre espace de gestion.</p><ul><li>✓ Accès par rôle</li><li>✓ Journal de sécurité</li>{supportEmail && <li>✓ Assistance par email</li>}</ul></div><DashboardMockup compact/></aside><form onSubmit={submit}><button type="button" className="modalClose" onClick={close} aria-label="Fermer">×</button><span className="sectionEyebrow">{mode === 'login' ? 'Ravi de vous revoir' : 'CRÉATION DE COMPTE'}</span><h2>{mode === 'login' ? 'Connexion à votre compte' : 'Créer votre espace'}</h2><p>{mode === 'login' ? 'Accédez à votre environnement StockMaster.' : 'Les offres et l’éventuel essai seront confirmés avant activation.'}</p>{mode === 'register' && <div className="authGrid"><label>Nom complet<input required value={values.fullName} onChange={event => update('fullName', event.target.value)} placeholder="Votre nom"/></label><label>Entreprise<input required value={values.companyName} onChange={event => update('companyName', event.target.value)} placeholder="Nom de l’entreprise"/></label><label>Première boutique<input required value={values.storeName} onChange={event => update('storeName', event.target.value)} placeholder="Nom de la boutique"/></label><label>Pays<select value={values.countryCode} onChange={event => update('countryCode', event.target.value)}><option value="GN">Guinée - GNF</option><option value="SN">Sénégal - XOF</option><option value="CI">Côte d’Ivoire - XOF</option><option value="ML">Mali - XOF</option></select></label><label className="full">Forfait souhaité<select value={values.plan} onChange={event => update('plan', event.target.value)}><option value="basic">Basic</option><option value="pro">Pro</option><option value="business">Business</option></select></label></div>}<label>Email<input type="email" required value={values.email} onChange={event => update('email', event.target.value)} placeholder="vous@entreprise.com"/></label><label>Mot de passe<div className="passwordField"><input type={showPassword ? 'text' : 'password'} required value={values.password} onChange={event => update('password', event.target.value)} placeholder="10 caractères minimum"/><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Masquer' : 'Voir'}</button></div></label>{mode === 'register' && <><label>Confirmer le mot de passe<input type={showPassword ? 'text' : 'password'} required value={values.confirm} onChange={event => update('confirm', event.target.value)} placeholder="Répétez le mot de passe"/></label><label className="legalConsent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>J’accepte les <a href="/terms/" target="_blank">conditions d’utilisation</a> et j’ai lu la <a href="/privacy/" target="_blank">politique de confidentialité</a>.</span></label></>}{mode === 'login' && <button className="forgotButton" type="button" onClick={() => void resetPassword()}>Mot de passe oublié ?</button>}{error && <p className="formError">{error}</p>}{success && <p className="formSuccess">{success}</p>}<button className="primaryButton authSubmit" disabled={busy || !!success || (mode === 'register' && !accepted)}>{busy ? 'Traitement en cours…' : mode === 'login' ? 'Se connecter →' : 'Créer mon compte →'}</button><button className="authSwitch" type="button" onClick={() => { setError(''); setSuccess(''); switchMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte - Me connecter'}</button></form></section></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
