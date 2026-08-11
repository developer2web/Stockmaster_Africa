import { Text } from 'react-native-paper';
import { LegalPage, legalStyles } from '@/components/legal/LegalPage';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="27 juillet 2026">
      <Text variant="titleLarge" style={legalStyles.heading}>Données collectées</Text>
      <Text style={legalStyles.paragraph}>StockMaster traite les informations du compte, de l’entreprise, des employés, des produits, des stocks, des ventes, des dépenses, des paiements et les journaux de sécurité nécessaires au fonctionnement du service.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Utilisation</Text>
      <Text style={legalStyles.paragraph}>Ces données servent à fournir la gestion commerciale, sécuriser les accès, produire les rapports, traiter les abonnements et diagnostiquer les erreurs. StockMaster ne vend pas les données personnelles.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Accès et conservation</Text>
      <Text style={legalStyles.paragraph}>Les données d’une entreprise sont accessibles uniquement aux utilisateurs autorisés selon leur rôle. Les transactions financières peuvent être conservées conformément aux obligations comptables applicables, même après une demande de suppression.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Sous-traitants</Text>
      <Text style={legalStyles.paragraph}>L’hébergement, l’authentification, les paiements et le suivi des incidents peuvent nécessiter des prestataires techniques. Seules les données nécessaires leur sont transmises.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Vos droits</Text>
      <Text style={legalStyles.paragraph}>Vous pouvez demander l’accès, la correction ou la suppression de vos données depuis les paramètres. Une vérification d’identité peut être demandée.</Text>
      <Text variant="titleLarge" style={legalStyles.heading}>Contact</Text>
      <Text style={legalStyles.paragraph}>Pour toute question relative aux données personnelles, utilisez l’adresse de support publiée dans la fiche officielle de StockMaster.</Text>
    </LegalPage>
  );
}
