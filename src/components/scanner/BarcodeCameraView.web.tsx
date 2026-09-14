import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useEffect, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type ScannedCode = { data: string };

export type BarcodeCameraViewProps = {
  style?: StyleProp<ViewStyle>;
  active: boolean;
  torch: boolean;
  barcodeTypes: string[];
  onScanned: (result: ScannedCode) => void;
};

// expo-camera ne lit que les QR codes sur le web (jsQR, une librairie QR-only —
// même en demandant explicitement ean13/upc/code128 via barcodeScannerSettings,
// la couche web de l'API les ignore). Un vrai code-barres de produit du commerce
// (EAN13/UPC) n'est donc jamais détecté par la caméra sur le web. Ce composant
// remplace la détection uniquement sur le web par ZXing, qui lit réellement ces
// formats depuis le flux vidéo de la caméra, sans changer le comportement natif.
const FORMAT_MAP: Record<string, BarcodeFormat> = {
  qr: BarcodeFormat.QR_CODE,
  ean13: BarcodeFormat.EAN_13,
  ean8: BarcodeFormat.EAN_8,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
  code128: BarcodeFormat.CODE_128,
  code39: BarcodeFormat.CODE_39,
};

export function BarcodeCameraView({ style, active, torch, barcodeTypes, onScanned }: BarcodeCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onScannedRef = useRef(onScanned);
  onScannedRef.current = onScanned;

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;
    const hints = new Map<DecodeHintType, unknown>();
    const formats = barcodeTypes.map((type) => FORMAT_MAP[type]).filter((value): value is BarcodeFormat => value !== undefined);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats.length ? formats : Object.values(FORMAT_MAP));
    const reader = new BrowserMultiFormatReader(hints);
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result) => {
          if (cancelled || !activeRef.current || !result) return;
          onScannedRef.current({ data: result.getText() });
        },
      )
      .then((controls) => { if (cancelled) controls.stop(); else controlsRef.current = controls; })
      .catch(() => undefined); // Permission refusée ou caméra indisponible : le champ de saisie manuelle reste utilisable.
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // barcodeTypes est fourni comme un littéral stable par l'écran appelant ; onScanned est lu via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void controlsRef.current?.switchTorch?.(torch).catch(() => undefined);
  }, [torch]);

  return (
    <View style={style}>
      <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </View>
  );
}
