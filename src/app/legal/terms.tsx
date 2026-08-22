import { Text } from 'react-native-paper';
import { LegalPage, legalStyles } from '@/components/legal/LegalPage';
import { legalIdentity } from '@/constants/legal';

export default function TermsScreen() {
  return (
    <LegalPage title="Conditions d’utilisation" updatedAt="21 août 2026">
      <Text variant="titleLarge" style={legalStyles.heading}>1. Éditeur et acceptation</Text>
      <Text style={legalStyles.paragraph}>StockMaster est édité par {legalIdentity.entityName}, {legalIdentity.address}, immatriculation {legalIdentity.registrationNumber}. En créant un compte ou en utilisant le service, vous acceptez les présentes conditions et la politique de confidentialité. La personne créant une entreprise déclare être autorisée à agir pour celle-ci.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>2. Service</Text>
      <Text style={legalStyles.paragraph}>StockMaster fournit des outils de gestion de boutiques, stocks, ventes, clients, fournisseurs, dépenses, caisse, employés, abonnements, reçus et rapports. Il ne remplace pas les conseils d’un comptable, d’un fiscaliste ou d’un juriste. L’entreprise utilisatrice reste responsable de l’exactitude des données, des prix, taxes, autorisations et documents qu’elle émet.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>3. Comptes, rôles et sécurité</Text>
      <Text style={legalStyles.paragraph}>Chaque compte est personnel. Les identifiants ne doivent pas être partagés. L’administrateur attribue les rôles et boutiques de ses employés et doit retirer rapidement les accès devenus inutiles. Sont interdits : fraude, accès non autorisé, contournement des permissions, atteinte au service, contenu illicite et usage portant atteinte aux droits d’autrui.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>4. Essais, forfaits et paiement</Text>
      <Text style={legalStyles.paragraph}>La durée d’un essai, son éligibilité, le prix, la devise, les limites, la période de facturation et toute réduction sont ceux affichés avant validation. Un essai n’est pas garanti lorsqu’il n’est pas proposé à l’écran. Un paiement Orange Money reste en attente jusqu’à vérification. Un paiement par carte n’est considéré comme accepté qu’après confirmation du prestataire et du serveur. Aucun renouvellement ou débit automatique ne doit être appliqué s’il n’a pas été clairement présenté et accepté.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>5. Annulation et remboursements</Text>
      <Text style={legalStyles.paragraph}>Les conditions d’annulation ou de remboursement affichées lors de l’achat s’appliquent, sous réserve des droits impératifs prévus par la loi. Une demande peut être examinée notamment en cas de double paiement, d’erreur technique ou de paiement non activé. La fermeture d’un compte n’annule pas automatiquement une obligation de paiement déjà née ni un abonnement géré par une boutique d’applications.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>6. Mode hors ligne, sauvegardes et disponibilité</Text>
      <Text style={legalStyles.paragraph}>Certaines opérations peuvent être enregistrées hors ligne puis synchronisées. Des conflits, doublons ou rejets peuvent survenir ; l’utilisateur doit contrôler la synchronisation avant de s’appuyer sur les données. Le service peut être interrompu pour maintenance, sécurité, réseau ou panne d’un prestataire. Aucune disponibilité permanente n’est garantie sauf engagement contractuel écrit distinct. L’utilisateur conserve les exports et justificatifs nécessaires à ses propres obligations.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>7. Propriété intellectuelle</Text>
      <Text style={legalStyles.paragraph}>Le logiciel, la marque, les interfaces et les contenus StockMaster restent la propriété de leur titulaire. L’abonnement confère seulement un droit d’utilisation limité, non exclusif et non transférable. L’utilisateur conserve ses droits sur les données qu’il saisit et autorise leur traitement uniquement pour fournir et sécuriser le service.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>8. Suspension et fin du service</Text>
      <Text style={legalStyles.paragraph}>L’accès peut être limité ou suspendu en cas d’impayé, de risque de sécurité, d’usage interdit ou d’obligation légale, avec information lorsque cela est possible. Le compte peut demander sa suppression dans Paramètres. Les données sans obligation de conservation sont supprimées ou anonymisées ; les autres sont archivées avec accès restreint pendant la durée applicable.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>9. Responsabilité</Text>
      <Text style={legalStyles.paragraph}>Chaque partie répond des dommages directs qu’elle cause dans les limites permises par la loi. Aucune clause ne limite une responsabilité qui ne peut légalement l’être, notamment en cas de fraude ou faute intentionnelle. StockMaster n’est pas responsable des données inexactes saisies par l’utilisateur, d’un usage non autorisé de ses accès ou d’un service tiers hors de son contrôle.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>10. Droit applicable, réclamations et contact</Text>
      <Text style={legalStyles.paragraph}>Le droit et les juridictions compétentes dépendent de l’établissement légal de l’éditeur et des règles impératives applicables à l’utilisateur. Avant toute procédure, les parties chercheront une solution amiable par {legalIdentity.supportEmail}. L’identité, l’adresse et les règles de juridiction doivent être validées par un juriste avant publication.</Text>
    </LegalPage>
  );
}
