import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

// Illustrations vectorielles de la démo (aucune photo récupérée ailleurs : pas de droits
// à gérer, rendu net à toutes les tailles, identique sur web, Android et iPhone).
// Chaque produit est dessiné dans une boîte de 100 × 100 pour être réutilisé partout :
// vignette de vente, jauge de stock, ligne de caisse et scène d'étagère.

export type DemoProductKind = 'riz' | 'huile' | 'sucre' | 'savon' | 'tomate' | 'lait';

export const demoPalette = {
  brand: '#084B50',
  ochre: '#E3A23B',
  leaf: '#1E9E6A',
  tomato: '#C8412E',
  mist: '#F3F7F6',
  ink: '#12292D',
};

// Formes seules (sans <Svg>), pour pouvoir les composer dans la scène d'étagère.
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

export function ProductArt({ kind, size = 72 }: { kind: DemoProductKind; size?: number }) {
  // Décoratif : le nom du produit est toujours écrit à côté (masqué des lecteurs d'écran).
  return <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 100 100"><ProductShapes kind={kind} id={`p-${kind}`} /></Svg>
  </View>;
}

// Scène d'ouverture : une étagère de boutique garnie, et le téléphone qui encaisse.
export function ShopShelfScene() {
  const shelf: { kind: DemoProductKind; x: number; y: number; s: number }[] = [
    { kind: 'riz', x: 18, y: 26, s: 0.72 },
    { kind: 'huile', x: 84, y: 30, s: 0.66 },
    { kind: 'sucre', x: 136, y: 32, s: 0.62 },
    { kind: 'lait', x: 22, y: 104, s: 0.6 },
    { kind: 'tomate', x: 74, y: 108, s: 0.56 },
    { kind: 'savon', x: 122, y: 112, s: 0.56 },
  ];
  return <View accessible accessibilityRole="image" accessibilityLabel="Étagère de boutique avec du riz, de l’huile, du sucre, du lait, de la tomate et du savon, et un téléphone qui encaisse une vente" style={{ width: '100%', height: '100%' }}><Svg width="100%" height="100%" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
    <Defs>
      <LinearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#0C5E64" /><Stop offset="1" stopColor={demoPalette.brand} /></LinearGradient>
      <LinearGradient id="scene-wood" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#B87A3E" /><Stop offset="1" stopColor="#8E5A2B" /></LinearGradient>
      <ClipPath id="scene-frame"><Rect x="0" y="0" width="340" height="190" rx="22" /></ClipPath>
    </Defs>
    <G clipPath="url(#scene-frame)">
    <Rect x="0" y="0" width="340" height="190" fill="url(#scene-sky)" />
    <Circle cx="292" cy="38" r="54" fill={demoPalette.ochre} fillOpacity="0.2" />
    <Circle cx="292" cy="38" r="30" fill={demoPalette.ochre} fillOpacity="0.35" />
    {/* Étagère */}
    <Rect x="12" y="84" width="186" height="9" rx="3" fill="url(#scene-wood)" />
    <Rect x="12" y="160" width="186" height="9" rx="3" fill="url(#scene-wood)" />
    <Rect x="12" y="20" width="6" height="150" rx="2" fill="#7A4C24" />
    <Rect x="192" y="20" width="6" height="150" rx="2" fill="#7A4C24" />
    {shelf.map(item => <G key={item.kind} transform={`translate(${item.x} ${item.y}) scale(${item.s})`}><ProductShapes kind={item.kind} id={`scene-${item.kind}`} /></G>)}
    {/* Téléphone qui encaisse */}
    <G transform="translate(222 34) rotate(6)">
      <Rect x="0" y="0" width="92" height="146" rx="16" fill="#0E2226" />
      <Rect x="6" y="10" width="80" height="126" rx="10" fill="#FFFFFF" />
      <Rect x="6" y="10" width="80" height="26" rx="10" fill={demoPalette.brand} />
      <SvgText fontFamily="sans-serif" x="46" y="27" fontSize="8.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">Nouvelle vente</SvgText>
      <Rect x="14" y="44" width="64" height="7" rx="3.5" fill="#E4ECEA" />
      <Rect x="14" y="56" width="46" height="7" rx="3.5" fill="#E4ECEA" />
      <Rect x="14" y="68" width="54" height="7" rx="3.5" fill="#E4ECEA" />
      <SvgText fontFamily="sans-serif" x="14" y="88" fontSize="7" fill="#5C6E6B">Total</SvgText>
      <SvgText fontFamily="sans-serif" x="78" y="99" fontSize="9.5" fontWeight="bold" fill={demoPalette.ink} textAnchor="end">55 000 GNF</SvgText>
      <Rect x="14" y="106" width="64" height="20" rx="10" fill={demoPalette.leaf} />
      <Path d="M36 116 L42 122 L54 110" stroke="#FFFFFF" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
    </G>
  </Svg></View>;
}

// Recettes des 7 derniers jours ; la dernière barre (aujourd'hui) est mise en avant.
export function WeekChart({ values, labels, height = 150, highlightColor = demoPalette.ochre }: { values: number[]; labels: string[]; height?: number; highlightColor?: string }) {
  const max = Math.max(...values, 1);
  const barWidth = 34;
  const gap = 22;
  const plot = 120;
  const width = values.length * barWidth + (values.length - 1) * gap;
  return <View accessible accessibilityRole="image" accessibilityLabel="Recettes des 7 derniers jours, en hausse aujourd’hui" style={{ width: '100%', height }}>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} 150`} preserveAspectRatio="xMidYMid meet">
      {values.map((value, index) => {
        const barHeight = Math.max(6, (value / max) * plot);
        const x = index * (barWidth + gap);
        const today = index === values.length - 1;
        return <G key={labels[index]}>
          <Rect x={x} y={plot - barHeight + 4} width={barWidth} height={barHeight} rx="8" fill={today ? highlightColor : '#CFE3E1'} />
          <SvgText fontFamily="sans-serif" x={x + barWidth / 2} y={144} fontSize="12" fontWeight={today ? 'bold' : 'normal'} fill={today ? demoPalette.ink : '#6B7F7C'} textAnchor="middle">{labels[index]}</SvgText>
        </G>;
      })}
    </Svg>
  </View>;
}
