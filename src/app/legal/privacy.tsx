import { Text } from 'react-native-paper';
import { LegalPage, legalStyles } from '@/components/legal/LegalPage';
import { legalIdentity } from '@/constants/legal';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="21 août 2026">
      <Text variant="titleLarge" style={legalStyles.heading}>1. Responsable du traitement</Text>
      <Text style={legalStyles.paragraph}>{legalIdentity.entityName}, {legalIdentity.address}, exploite le service {legalIdentity.serviceName}. Immatriculation : {legalIdentity.registrationNumber}. Contact confidentialité : {legalIdentity.privacyEmail}.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>2. Données traitées</Text>
      <Text style={legalStyles.paragraph}>Selon les fonctions utilisées, StockMaster traite : identité et coordonnées du compte ; entreprise, boutiques, employés et permissions ; produits, stocks, ventes, clients, fournisseurs, dettes, dépenses et caisse ; informations d’abonnement et état des paiements ; références ou justificatifs Orange Money ; journaux de connexion, appareil, erreurs et sécurité ; images ou documents choisis volontairement. Le scanner utilise la caméra uniquement après autorisation.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>3. Finalités et fondements</Text>
      <Text style={legalStyles.paragraph}>Ces données servent à créer et administrer le compte, exécuter le service demandé, synchroniser les opérations, produire les reçus et rapports, traiter l’abonnement, assister les utilisateurs, prévenir la fraude et sécuriser la plateforme. Selon la situation, le traitement repose sur l’exécution du contrat, une obligation légale, l’intérêt légitime de sécurité ou le consentement lorsque celui-ci est requis.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>4. Paiements et destinataires</Text>
      <Text style={legalStyles.paragraph}>Les paiements par carte sont traités par Stripe. StockMaster ne reçoit pas le numéro complet de la carte, mais conserve les références, montants et statuts nécessaires au suivi. Les paiements Orange Money peuvent nécessiter une référence et un justificatif. Les données strictement nécessaires peuvent être communiquées aux prestataires d’hébergement, d’authentification, d’email, de paiement, de stockage et de diagnostic, ainsi qu’aux autorités lorsque la loi l’exige. StockMaster ne vend pas les données personnelles.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>5. Accès, hébergement et transferts</Text>
      <Text style={legalStyles.paragraph}>Les accès sont limités par entreprise, boutique, rôle et permission. Certains prestataires peuvent héberger ou traiter des données en dehors du pays de l’utilisateur. L’éditeur doit alors encadrer ces transferts par les garanties contractuelles et mesures de sécurité applicables.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>6. Conservation</Text>
      <Text style={legalStyles.paragraph}>Les données sont conservées pendant la relation contractuelle puis pendant la durée nécessaire aux finalités décrites. Après fermeture, les données qui ne sont plus nécessaires sont supprimées ou anonymisées. Les pièces comptables, paiements, traces de sécurité et éléments utiles à une obligation légale, à la prévention de la fraude ou à un litige peuvent être conservés pendant la durée légalement applicable, avec accès restreint. Les sauvegardes sont purgées selon le cycle technique de l’hébergeur.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>7. Vos droits</Text>
      <Text style={legalStyles.paragraph}>Sous réserve de la loi applicable, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, l’opposition ou la portabilité de vos données, et retirer un consentement sans effet rétroactif. Une vérification d’identité peut être demandée. La suppression du compte peut être initiée dans Paramètres. Vous pouvez également saisir l’autorité de protection des données compétente.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>8. Sécurité et incidents</Text>
      <Text style={legalStyles.paragraph}>StockMaster applique des mesures destinées à protéger la confidentialité, l’intégrité et la disponibilité des données, notamment l’authentification, les permissions et la journalisation. Aucun système n’étant infaillible, l’éditeur traite les incidents et effectue les notifications requises par la loi.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>9. Mineurs et modifications</Text>
      <Text style={legalStyles.paragraph}>Le service est destiné à la gestion professionnelle et non aux mineurs. La politique peut évoluer pour refléter le service ou la réglementation. Toute modification importante est signalée par un moyen approprié.</Text>

      <Text variant="titleLarge" style={legalStyles.heading}>10. Contact</Text>
      <Text style={legalStyles.paragraph}>Confidentialité : {legalIdentity.privacyEmail}. Assistance : {legalIdentity.supportEmail}. Ces coordonnées et l’identité légale de l’éditeur doivent être complétées et vérifiées avant toute publication.</Text>
    </LegalPage>
  );
}
