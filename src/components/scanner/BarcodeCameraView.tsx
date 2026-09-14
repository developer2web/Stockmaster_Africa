import { BarcodeScanningResult, CameraView } from 'expo-camera';
import { StyleProp, ViewStyle } from 'react-native';

export type ScannedCode = { data: string };

export type BarcodeCameraViewProps = {
  style?: StyleProp<ViewStyle>;
  active: boolean;
  torch: boolean;
  barcodeTypes: string[];
  onScanned: (result: ScannedCode) => void;
};

// Natif (iOS/Android) : la détection utilise la vision native de l'appareil
// (AVFoundation / ML Kit via expo-camera), qui lit correctement les codes-barres
// EAN13/UPC/Code128 du commerce, pas seulement les QR codes.
export function BarcodeCameraView({ style, active, torch, barcodeTypes, onScanned }: BarcodeCameraViewProps) {
  const handleScanned = (event: BarcodeScanningResult) => onScanned({ data: event.data });
  return (
    <CameraView
      style={style}
      facing="back"
      enableTorch={torch}
      onBarcodeScanned={active ? handleScanned : undefined}
      barcodeScannerSettings={{ barcodeTypes: barcodeTypes as never }}
    />
  );
}
