import React, { useEffect, useState } from 'react';

export type AdminView = 'Vue générale' | 'Entreprises' | 'Utilisateurs' | 'Abonnements' | 'Paiements' | 'Promotions' | 'Support' | 'Erreurs' | 'Avertissements' | 'Activité' | 'Paramètres';
type Group = { label: string; items: AdminView[] };
const groups: Group[] = [
  { label: 'Clients', items: ['Entreprises', 'Utilisateurs'] },
  { label: 'Facturation', items: ['Paiements', 'Abonnements', 'Promotions'] },
  { label: 'Suivi', items: ['Support', 'Erreurs', 'Avertissements'] },
  { label: 'Administration', items: ['Activité', 'Paramètres'] },
];
const icons: Record<AdminView, string> = { 'Vue générale': '⌂', Entreprises: '▦', Utilisateurs: '♧', Abonnements: '▤', Paiements: '▣', Promotions: '◇', Support: '◉', Erreurs: '!', Avertissements: '⚠', Activité: '◷', Paramètres: '⚙' };
export const pageDescriptions: Record<AdminView, string> = {
  'Vue générale': 'Les actions à traiter et les chiffres essentiels de StockMaster.',
  Entreprises: 'Retrouvez une entreprise, ses boutiques et son accès à la plateforme.',
  Utilisateurs: 'Consultez les comptes et gérez leurs accès.',
  Paiements: 'Vérifiez les déclarations Orange Money et suivez les paiements par carte.',
  Abonnements: 'Gérez les forfaits, les essais et les échéances de vos clients.',
  Promotions: 'Créez et suivez vos offres commerciales.',
  Support: 'Répondez aux demandes et suivez leur résolution.',
  Erreurs: 'Examinez les incidents signalés par l’application et leur résolution.',
  Avertissements: 'Repérez les points à surveiller et les problèmes d’envoi des emails.',
  Activité: 'Retrouvez les opérations enregistrées dans le journal.',
  Paramètres: 'Configurez les paiements, les essais, les emails et la sécurité de votre compte.',
};
type Props = { view: AdminView; onNavigate: (view: AdminView) => void; onLogout: () => void; counts: Partial<Record<AdminView, number>> };

export function AdminSidebar({ view, onNavigate, onLogout, counts }: Props) {
  const isAdministration = view === 'Activité' || view === 'Paramètres';
  const [administrationOpen, setAdministrationOpen] = useState(isAdministration);
  useEffect(() => { if (isAdministration) setAdministrationOpen(true); }, [isAdministration]);
  function itemButton(item: AdminView) {
    const count = counts[item] ?? 0;
    return <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => onNavigate(item)}>
      <i aria-hidden="true">{icons[item]}</i><span>{item}</span>
      {count > 0 && <b className="navCount" aria-label={`${count} à traiter`}>{count > 99 ? '99+' : count}</b>}
    </button>;
  }
  return <aside className="side structuredSide">
    <div className="sideBrand"><img src="/stockmaster-icon.png" alt=""/><div><b>StockMaster</b><small>SUPER ADMIN</small></div></div>
    <nav aria-label="Navigation principale">
      {itemButton('Vue générale')}
      {groups.map(group => <section className="navigationGroup" key={group.label} aria-label={group.label}>
        {group.label === 'Administration' ? <>
          <button className="navigationGroupToggle" aria-expanded={administrationOpen} aria-controls="administration-links" onClick={() => setAdministrationOpen(open => !open)}>Administration <span aria-hidden="true">{administrationOpen ? '−' : '+'}</span></button>
          <div id="administration-links" hidden={!administrationOpen}>{group.items.map(itemButton)}</div>
        </> : <><h2>{group.label}</h2>{group.items.map(itemButton)}</>}
      </section>)}
    </nav>
    <div className="accountBlock"><button className="profile" onClick={() => onNavigate('Paramètres')}><span>SA</span><div><b>Super Admin</b><small>Mon compte et réglages</small></div><em aria-hidden="true">›</em></button><button className="logoutButton" onClick={onLogout}>Déconnexion</button></div>
  </aside>;
}

export function AdminMobileHeader({ view, onNavigate, onLogout, counts }: Props) {
  return <header className="mobileHead structuredMobileHead">
    <div><b>StockMaster Admin</b><button onClick={onLogout}>Déconnexion</button></div>
    <label><span>Aller à</span><select value={view} onChange={event => onNavigate(event.target.value as AdminView)}>
      <option>Vue générale</option>
      {groups.map(group => <optgroup label={group.label} key={group.label}>{group.items.map(item => <option value={item} key={item}>{item}{counts[item] ? ` (${counts[item]})` : ''}</option>)}</optgroup>)}
    </select></label>
  </header>;
}
