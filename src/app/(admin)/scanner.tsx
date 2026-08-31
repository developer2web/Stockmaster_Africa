import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, HelperText, Icon, IconButton, Text, TextInput } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { lookupProductCode, type ProductCodeLookup } from '@/features/inventory/api';
import { userErrorMessage } from '@/utils/errors';
import { useAuth } from '@/features/auth/AuthProvider';

export default function ScannerScreen() {
  const { mode, inventoryId } = useLocalSearchParams<{ mode?: string; inventoryId?: string }>();
  const { membership, selectStore } = useAuth();
  const { height, width } = useWindowDimensions();
  const cameraHeight = Math.max(240, Math.min(420, height * 0.52, width * 1.15));
  const employee=membership?.role==='employee';
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [missing, setMissing] = useState('');
  const [conflict, setConflict] = useState<ProductCodeLookup|null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const lastScan = useRef({ code: '', at: 0 });

  const reset = useCallback(() => {
    setMissing('');
    setConflict(null);
    setError('');
    lastScan.current = { code: '', at: 0 };
    setTimeout(() => setLocked(false), 250);
  }, []);

  const find = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    const now = Date.now();
    if (!code || locked || (lastScan.current.code === code && now - lastScan.current.at < 1800)) return;
    if (code.length > 160) {
      setError('Ce code est trop long ou invalide.');
      setLocked(true);
      return;
    }
    lastScan.current = { code, at: now };
    setLocked(true);
    setError('');
    setMissing('');
    setConflict(null);
    try {
      const found = await lookupProductCode(code, membership?.storeId ?? '', membership?.companyId ?? '');
      if (found) {
        if (!found.isActive || found.storeId !== membership?.storeId) {
          setConflict(found);
          return;
        }
        if (mode === 'sale') router.replace({ pathname: (employee?'/employee/sales/new':'/sales/new') as never, params: { productId: found.productId, variantId: found.variantId ?? '', scanToken:String(Date.now()) } });
        else if(mode==='inventory')router.replace({pathname:'/inventory-count' as never,params:{inventoryId:inventoryId??'',productId:found.productId}});
        else router.replace(`/products/${found.productId}` as never);
        return;
      }
      setMissing(code);
    } catch (scanError) {
      setError(userErrorMessage(scanError, 'Recherche impossible. Réessayez.'));
    }
  }, [employee, inventoryId, locked, membership?.companyId, membership?.storeId, mode]);

  const openExisting = useCallback(async () => {
    if (!conflict) return;
    if (conflict.storeId !== membership?.storeId) await selectStore(conflict.storeId);
    router.replace(`/products/${conflict.productId}` as never);
  }, [conflict, membership?.storeId, selectStore]);

  const scanned = useCallback(({ data }: BarcodeScanningResult) => { void find(data); }, [find]);
  const cameraActive = permission?.granted && !locked;

  return <AdminPage title={mode === 'sale' ? 'Scanner pour la vente' : mode==='inventory'?'Scanner pour l’inventaire':'Scanner un produit'}>
    {!permission && <Card><Card.Content><Text>Chargement de la caméra…</Text></Card.Content></Card>}
    {permission && !permission.granted && <Card mode="outlined"><Card.Content style={styles.permission}>
      <Icon source="camera-off" size={42} />
      <Text variant="titleMedium">Autorisation caméra requise</Text>
      <Text>StockMaster utilise la caméra uniquement pour lire les QR codes et codes-barres.</Text>
      {permission.canAskAgain
        ? <AppButton onPress={requestPermission}>Autoriser la caméra</AppButton>
        : <AppButton onPress={() => void Linking.openSettings()}>Ouvrir les réglages</AppButton>}
    </Card.Content></Card>}
    {permission?.granted && <View style={[styles.cameraWrap, { height: cameraHeight }]}>
      <CameraView
        style={styles.camera}
        facing="back"
        enableTorch={torch}
        onBarcodeScanned={cameraActive ? scanned : undefined}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
      />
      <View style={[styles.frame, styles.noPointerEvents, locked && styles.frameLocked]} />
      <IconButton
        accessibilityLabel={torch ? 'Éteindre la lampe' : 'Allumer la lampe'}
        icon={torch ? 'flashlight-off' : 'flashlight'}
        iconColor="#fff"
        containerColor="rgba(0,0,0,0.55)"
        style={styles.torch}
        onPress={() => setTorch(value => !value)}
      />
      <View style={styles.status}><Text style={styles.statusText}>{locked ? 'Scan en pause' : 'Placez le code dans le cadre'}</Text></View>
    </View>}
    <TextInput mode="outlined" label={Platform.OS === 'web' ? 'Scanner USB ou saisie du code-barres' : 'Saisir le code-barres'} value={manual} onChangeText={setManual} autoCapitalize="characters" maxLength={160} autoFocus={Platform.OS === 'web'} blurOnSubmit={false} onSubmitEditing={() => void find(manual)} />
    <AppButton mode="outlined" loading={locked && !missing && !error} disabled={!manual.trim() || locked} onPress={() => void find(manual)}>Rechercher</AppButton>
    {!!error && <><HelperText type="error" visible>{error}</HelperText><AppButton icon="refresh" onPress={reset}>Recommencer</AppButton></>}
    {!!conflict && <Card mode="outlined"><Card.Content style={styles.unknown}>
      <Text variant="titleMedium">Ce code-barres est déjà enregistré</Text>
      <Text>Produit : {conflict.productName??'Produit existant'}</Text>
      <Text>Boutique : {conflict.storeName??(conflict.storeId===membership?.storeId?membership?.storeName:'Une autre boutique')}</Text>
      {!conflict.isActive&&<HelperText type="error" visible>Ce produit ou cette variante est actuellement inactif.</HelperText>}
      <Text>StockMaster conserve un seul produit par code-barres dans l’entreprise afin d’éviter les doublons.</Text>
      {!employee&&<AppButton icon="open-in-new" onPress={()=>void openExisting()}>{conflict.isActive?'Ouvrir le produit':'Ouvrir et réactiver'}</AppButton>}
      <AppButton mode="text" icon="refresh" onPress={reset}>Scanner un autre code</AppButton>
    </Card.Content></Card>}
    {!!missing && <Card mode="outlined"><Card.Content style={styles.unknown}>
      <Text variant="titleMedium">Code inconnu</Text><Text selectable>{missing}</Text>
      <Text>{mode === 'sale'
        ? employee?'Ce produit doit d’abord être créé par un administrateur avant de pouvoir être vendu.':'Créez ce produit maintenant. Son code-barres sera déjà rempli et il sera ajouté à la vente après l’enregistrement.'
        : 'Vous pouvez recommencer ou créer un produit avec ce code.'}</Text>
      {!employee&&<AppButton icon="plus" onPress={() => router.push({ pathname: '/products/new' as never, params: { barcode: missing, returnTo:mode==='sale'?'/sales/new':'' } })}>Créer le produit</AppButton>}
      <AppButton mode="text" icon="refresh" onPress={reset}>Scanner à nouveau</AppButton>
    </Card.Content></Card>}
  </AdminPage>;
}

const styles = StyleSheet.create({
  permission: { alignItems: 'center', gap: 12 },
  cameraWrap: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  frame: { position: 'absolute', left: '12%', right: '12%', top: '22%', bottom: '22%', borderWidth: 3, borderColor: '#79CED1', borderRadius: 22 },
  noPointerEvents: { pointerEvents: 'none' },
  frameLocked: { borderColor: '#FFD43B' },
  torch: { position: 'absolute', right: 12, top: 12 },
  status: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  statusText: { color: '#fff' },
  unknown: { gap: 10 },
});
