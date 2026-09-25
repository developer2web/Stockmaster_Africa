// Initiales affichées dans l'avatar rond du bloc « compte » (Menu, Paramètres) :
// jusqu'à deux lettres, prises sur les premiers mots du nom de l'entreprise.
export function companyInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'SM';
  return words.slice(0, 2).map(word => word[0]!.toUpperCase()).join('');
}
