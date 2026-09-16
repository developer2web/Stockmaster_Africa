import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { readableUserAgent } from './readableUserAgent';

// Étiquette lisible identifiant l'appareil qui vient de se connecter, utilisée
// par record_security_event pour que "Appareils connectés" / le journal de
// sécurité (account-web) distingue vraiment un appareil d'un autre. Avant ce
// fichier, le web envoyait toujours le même texte générique ("StockMaster •
// web") quel que soit le navigateur ou l'ordinateur : impossible de savoir
// combien d'appareils étaient réellement connectés, et le bouton "Voir" des
// appareils connectés menait à une liste de connexions toutes identiques.
export function currentDeviceLabel(): string {
  if (Platform.OS === 'web') {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return userAgent ? readableUserAgent(userAgent) : 'Navigateur web';
  }
  const model = Device.modelName;
  const os = Device.osName ?? (Platform.OS === 'ios' ? 'iOS' : 'Android');
  return model ? `${model} (${os})` : `Appareil ${os}`;
}
