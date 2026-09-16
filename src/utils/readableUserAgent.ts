// Pure, framework-free : utilisé à la fois par l'app mobile (deviceLabel.ts,
// web uniquement) et directement par les 3 apps web (Vite) qui n'ont pas accès
// à react-native/expo-device. Ne rien importer ici qui ne tourne pas aussi
// bien dans un simple navigateur.
export function readableUserAgent(userAgent: string): string {
  const browser = userAgent.includes('Edg/') ? 'Edge'
    : userAgent.includes('OPR/') || userAgent.includes('Opera') ? 'Opera'
    : userAgent.includes('Firefox/') ? 'Firefox'
    : userAgent.includes('Chrome/') ? 'Chrome'
    : /Version\/.*Safari/.test(userAgent) ? 'Safari'
    : null;
  const os = /Windows/.test(userAgent) ? 'Windows'
    : /iPad/.test(userAgent) ? 'iPadOS'
    : /iPhone|iPod/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;
  if (browser && os) return `${browser} sur ${os}`;
  if (browser) return browser;
  if (os) return os;
  return userAgent.slice(0, 120);
}
