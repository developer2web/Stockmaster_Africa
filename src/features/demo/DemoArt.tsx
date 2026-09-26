import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

// Images des produits fictifs de la démo, affichées UNIQUEMENT dans le cadre de vignette
// produit de l'application (là où apparaissent les photos des vrais produits) — la démo
// ne doit montrer aucun design qui n'existe pas dans l'app (retour du 26/09). Dessins
// vectoriels : pas de photo tierce ni de droits, nets à toute taille.

export type DemoProductKind = 'riz' | 'huile' | 'sucre' | 'savon' | 'tomate' | 'lait';

// Couleurs des emballages dessinés (pas des couleurs d'interface).
const demoPalette = {
  brand: '#084B50',
  ochre: '#E3A23B',
  leaf: '#1E9E6A',
  tomato: '#C8412E',
  ink: '#12292D',
};

// Formes dessinées dans une boîte de 100 × 100.
function ProductShapes({ kind, id }: { kind: DemoProductKind; id: string }) {
  switch (kind) {
    case 'riz':
      return <G>
        <Defs><LinearGradient id={`${id}-sack`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#F2E3C2" /><Stop offset="1" stopColor="#D9C08E" /></LinearGradient></Defs>
        <Path d="M22 30 Q20 18 34 16 L66 16 Q80 18 78 30 L84 84 Q84 92 74 92 L26 92 Q16 92 16 84 Z" fill={`url(#${id}-sack)`} stroke="#B9995F" strokeWidth="1.5" />
        <Path d="M34 16 Q50 8 66 16 L62 22 Q50 17 38 22 Z" fill="#CBB07A" />
        <Path d="M40 13 Q50 4 60 13" stroke="#8C6B34" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Rect x="24" y="44" width="52" height="28" rx="4" fill={demoPalette.brand} />
        <SvgText fontFamily="sans-serif" x="50" y="58" fontSize="12" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">RIZ</SvgText>
        <SvgText fontFamily="sans-serif" x="50" y="68" fontSize="8" fill={demoPalette.ochre} textAnchor="middle">5 kg</SvgText>
        <Path d="M26 36 L74 36 M28 80 L72 80" stroke="#C7AB74" strokeWidth="1" strokeDasharray="3 3" />
      </G>;
    case 'huile':
      return <G>
        <Defs><LinearGradient id={`${id}-oil`} x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#F4C74A" /><Stop offset="0.55" stopColor="#E3A23B" /><Stop offset="1" stopColor="#C98722" /></LinearGradient></Defs>
        <Rect x="42" y="6" width="16" height="10" rx="2" fill={demoPalette.tomato} />
        <Path d="M44 16 L56 16 L58 26 Q72 32 72 46 L72 86 Q72 94 64 94 L36 94 Q28 94 28 86 L28 46 Q28 32 42 26 Z" fill={`url(#${id}-oil)`} stroke="#B97A1C" strokeWidth="1.5" />
        <Path d="M34 44 Q34 36 42 33" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Rect x="30" y="56" width="40" height="24" rx="3" fill="#FFFFFF" />
        <SvgText fontFamily="sans-serif" x="50" y="68" fontSize="9" fontWeight="bold" fill={demoPalette.brand} textAnchor="middle">HUILE</SvgText>
        <SvgText fontFamily="sans-serif" x="50" y="76" fontSize="7" fill={demoPalette.ink} textAnchor="middle">1 litre</SvgText>
      </G>;
    case 'sucre':
      return <G>
        <Path d="M24 24 L66 18 L78 28 L78 90 L34 94 L24 84 Z" fill="#FFFFFF" stroke="#9DB6C9" strokeWidth="1.5" />
        <Path d="M24 24 L66 18 L78 28 L36 34 Z" fill="#E6EEF4" stroke="#9DB6C9" strokeWidth="1.5" />
        <Path d="M24 24 L36 34 L34 94 L24 84 Z" fill="#D5E1EA" />
        <Rect x="40" y="46" width="32" height="26" rx="3" fill="#2F5D8A" />
        <SvgText fontFamily="sans-serif" x="56" y="60" fontSize="8" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">SUCRE</SvgText>
        <SvgText fontFamily="sans-serif" x="56" y="68" fontSize="6.5" fill="#CFE0F0" textAnchor="middle">1 kg</SvgText>
        <Rect x="44" y="78" width="8" height="8" rx="1.5" fill="#FFFFFF" stroke="#9DB6C9" />
        <Rect x="55" y="78" width="8" height="8" rx="1.5" fill="#FFFFFF" stroke="#9DB6C9" />
      </G>;
    case 'savon':
      return <G>
        <Circle cx="30" cy="24" r="7" fill="#DFF4F1" stroke="#8ED3C7" />
        <Circle cx="44" cy="14" r="4.5" fill="#DFF4F1" stroke="#8ED3C7" />
        <Circle cx="70" cy="22" r="5.5" fill="#DFF4F1" stroke="#8ED3C7" />
        <Rect x="16" y="40" width="68" height="44" rx="14" fill="#2BA89A" />
        <Rect x="16" y="40" width="68" height="36" rx="14" fill="#3CC2B1" />
        <Rect x="26" y="50" width="48" height="16" rx="8" fill="#FFFFFF" fillOpacity="0.85" />
        <SvgText fontFamily="sans-serif" x="50" y="62" fontSize="9" fontWeight="bold" fill="#157A6E" textAnchor="middle">SAVON</SvgText>
      </G>;
    case 'tomate':
      return <G>
        <Ellipse cx="50" cy="22" rx="28" ry="7" fill="#C9CFD1" stroke="#98A1A4" />
        <Path d="M22 22 L22 84 Q22 92 50 92 Q78 92 78 84 L78 22 Q78 29 50 29 Q22 29 22 22 Z" fill={demoPalette.tomato} />
        <Path d="M22 34 Q50 42 78 34 L78 76 Q50 84 22 76 Z" fill="#FFFFFF" />
        <Circle cx="50" cy="55" r="11" fill="#E0503B" />
        <Path d="M44 45 L50 49 L56 45 L53 51 L47 51 Z" fill={demoPalette.leaf} />
        <SvgText fontFamily="sans-serif" x="50" y="74" fontSize="6.5" fontWeight="bold" fill={demoPalette.tomato} textAnchor="middle">TOMATE</SvgText>
      </G>;
    case 'lait':
      return <G>
        <Rect x="24" y="14" width="52" height="12" rx="4" fill="#2F5D8A" />
        <Rect x="22" y="24" width="56" height="68" rx="6" fill="#F7F9FB" stroke="#B9C7D3" strokeWidth="1.5" />
        <Path d="M22 58 Q36 50 50 58 T78 58 L78 86 Q78 92 72 92 L28 92 Q22 92 22 86 Z" fill="#DCE8F2" />
        <SvgText fontFamily="sans-serif" x="50" y="44" fontSize="9" fontWeight="bold" fill="#2F5D8A" textAnchor="middle">LAIT</SvgText>
        <SvgText fontFamily="sans-serif" x="50" y="53" fontSize="6.5" fill={demoPalette.ink} textAnchor="middle">en poudre</SvgText>
        <Circle cx="50" cy="74" r="7" fill="#FFFFFF" stroke="#B9C7D3" />
      </G>;
  }
}

// Même cadre que ProductThumbnail (taille, arrondi à 25 %, fond surfaceVariant) : la
// démo affiche ces images exactement là où l'app affiche la photo d'un produit.
// Décoratif : le nom du produit est toujours écrit à côté (masqué des lecteurs d'écran).
export function DemoThumbnail({ kind, size = 52, background }: { kind: DemoProductKind; size?: number; background: string }) {
  return <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), backgroundColor: background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <Svg width={size * 0.9} height={size * 0.9} viewBox="0 0 100 100"><ProductShapes kind={kind} id={`p-${kind}-${size}`} /></Svg>
  </View>;
}


