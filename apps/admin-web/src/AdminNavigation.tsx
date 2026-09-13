import React, { useEffect, useId, useRef, useState } from 'react';

export type AdminView = 'Vue générale' | 'Entreprises' | 'Utilisateurs' | 'Abonnements' | 'Paiements' | 'Promotions' | 'Support' | 'Suppressions' | 'Erreurs' | 'Avertissements' | 'Activité' | 'Paramètres';
type Group = { label: string; items: AdminView[] };
const groups: Group[] = [
  { label: 'Clients', items: ['Entreprises', 'Utilisateurs'] },
  { label: 'Facturation', items: ['Paiements', 'Abonnements', 'Promotions'] },
  { label: 'Suivi', items: ['Support', 'Suppressions', 'Erreurs', 'Avertissements'] },
  { label: 'Administration', items: ['Activité', 'Paramètres'] },
];
const icons: Record<AdminView, string> = { 'Vue générale': '⌂', Entreprises: '▦', Utilisateurs: '♧', Abonnements: '▤', Paiements: '▣', Promotions: '◇', Support: '◉', Suppressions: '⌫', Erreurs: '!', Avertissements: '⚠', Activité: '◷', Paramètres: '⚙' };
export const pageDescriptions: Record<AdminView, string> = {
  'Vue générale': 'Les actions à traiter et les chiffres essentiels de StockMaster.',
  Entreprises: 'Retrouvez une entreprise, ses boutiques et son accès à la plateforme.',
  Utilisateurs: 'Consultez les comptes et gérez leurs accès.',
  Paiements: 'Vérifiez les déclarations Orange Money et suivez les paiements par carte.',
  Abonnements: 'Gérez les forfaits, les essais et les échéances de vos clients.',
  Promotions: 'Créez et suivez vos offres commerciales.',
  Support: 'Répondez aux demandes et suivez leur résolution.',
  Suppressions: 'Traitez les demandes de suppression de compte des clients.',
  Erreurs: 'Examinez les incidents signalés par l’application et leur résolution.',
  Avertissements: 'Repérez les points à surveiller et les problèmes d’envoi des emails.',
  Activité: 'Retrouvez les opérations enregistrées dans le journal.',
  Paramètres: 'Configurez les paiements, les essais, les emails et la sécurité de votre compte.',
};
type Props = { view: AdminView; onNavigate: (view: AdminView) => void; onLogout: () => void; counts: Partial<Record<AdminView, number>> };

/** Shared with the desktop sidebar and the mobile drawer so both always list the same pages. */
function NavList({ view, onNavigate, counts }: Omit<Props, 'onLogout'>) {
  const isAdministration = view === 'Activité' || view === 'Paramètres';
  const [administrationOpen, setAdministrationOpen] = useState(isAdministration);
  useEffect(() => { if (isAdministration) setAdministrationOpen(true); }, [isAdministration]);
  // NavList renders twice at once (desktop sidebar + mobile drawer): ids must not collide.
  const administrationLinksId = useId();
  function itemButton(item: AdminView) {
    const count = counts[item] ?? 0;
    return <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => onNavigate(item)}>
      <i aria-hidden="true">{icons[item]}</i><span>{item}</span>
      {count > 0 && <b className="navCount" aria-label={`${count} à traiter`}>{count > 99 ? '99+' : count}</b>}
    </button>;
  }
  return <nav aria-label="Navigation principale">
    {itemButton('Vue générale')}
    {groups.map(group => <section className="navigationGroup" key={group.label} aria-label={group.label}>
      {group.label === 'Administration' ? <>
        <button className="navigationGroupToggle" aria-expanded={administrationOpen} aria-controls={administrationLinksId} onClick={() => setAdministrationOpen(open => !open)}>Administration <span aria-hidden="true">{administrationOpen ? '−' : '+'}</span></button>
        <div id={administrationLinksId} hidden={!administrationOpen}>{group.items.map(itemButton)}</div>
      </> : <><h2>{group.label}</h2>{group.items.map(itemButton)}</>}
    </section>)}
  </nav>;
}

function Brand({ children }: { children?: React.ReactNode }) {
  return <div className="sideBrand"><img src="/stockmaster-icon.png" alt=""/><div><b>StockMaster</b><small>SUPER ADMIN</small></div>{children}</div>;
}

function AccountBlock({ onNavigate, onLogout }: Pick<Props, 'onNavigate' | 'onLogout'>) {
  return <div className="accountBlock">
    <button className="profile" onClick={() => onNavigate('Paramètres')}><span>SA</span><div><b>Super Admin</b><small>Mon compte et réglages</small></div><em aria-hidden="true">›</em></button>
    <button className="logoutButton" onClick={onLogout}>Déconnexion</button>
  </div>;
}

export function AdminSidebar({ view, onNavigate, onLogout, counts }: Props) {
  return <aside className="side structuredSide">
    <Brand/>
    <NavList view={view} onNavigate={onNavigate} counts={counts}/>
    <AccountBlock onNavigate={onNavigate} onLogout={onLogout}/>
  </aside>;
}

export function AdminMobileHeader({ view, onNavigate, onLogout, counts }: Props) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) closeButtonRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  function close() { setOpen(false); hamburgerRef.current?.focus(); }
  function navigate(item: AdminView) { onNavigate(item); close(); }

  return <>
    <header className="mobileHead structuredMobileHead">
      <div>
        <span className="mobileHeadLeft">
          <button ref={hamburgerRef} className="hamburgerButton" aria-label="Ouvrir le menu" aria-haspopup="true" aria-expanded={open} aria-controls="admin-mobile-drawer" onClick={() => setOpen(true)}><span aria-hidden="true">☰</span></button>
          <b>StockMaster Admin</b>
        </span>
        <button onClick={onLogout}>Déconnexion</button>
      </div>
    </header>
    {open && <div className="drawerScrim" role="presentation" onClick={close}>
      <aside id="admin-mobile-drawer" className="side mobileDrawer" role="dialog" aria-modal="true" aria-label="Navigation Super Admin" onClick={event => event.stopPropagation()}>
        <Brand><button ref={closeButtonRef} className="drawerClose" aria-label="Fermer le menu" onClick={close}>×</button></Brand>
        <NavList view={view} onNavigate={navigate} counts={counts}/>
        <AccountBlock onNavigate={navigate} onLogout={onLogout}/>
      </aside>
    </div>}
  </>;
}
