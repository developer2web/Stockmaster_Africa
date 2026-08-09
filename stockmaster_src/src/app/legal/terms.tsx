import { Text } from 'react-native-paper';
import { LegalPage, legalStyles } from '@/components/legal/LegalPage';

export default function TermsScreen() {
  return (
    <LegalPage title="Conditions d’utilisation" updatedAt="27 juillet 2026">
      <Text variant="titleLarge" style={legalStyles.heading}>Objet</Text>
      <Text style={legalStyles.paragraph}>StockMaster fournit des outils de gestion de boutiques, stocks, ventes, dépenses, employés et abonnements. L’utilisateur reste responsable de l’exactitude des informations enregistrées.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Compte et sécurité</Text>
      <Text style={legalStyles.paragraph}>Chaque utilisateur doit protéger ses identifiants et utiliser uniquement les autorisations qui lui ont été attribuées. Toute activité frauduleuse ou tentative de contournement des protections est interdite.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Abonnements</Text>
      <Text style={legalStyles.paragraph}>Les limites et fonctions disponibles dépendent du forfait actif. Les prix, durées, renouvellements et périodes de grâce sont présentés avant le paiement.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Disponibilité</Text>
      <Text style={legalStyles.paragraph}>Des interruptions peuvent être nécessaires pour la maintenance, la sécurité ou en cas de panne d’un prestataire. Les sauvegardes ne remplacent pas les obligations légales propres à l’entreprise.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Résiliation</Text>
      <Text style={legalStyles.paragraph}>Un compte peut demander sa suppression depuis les paramètres. Les données soumises à une obligation légale de conservation pourront être archivées avec un accès restreint.</Text>
    </LegalPage>
  );
}
