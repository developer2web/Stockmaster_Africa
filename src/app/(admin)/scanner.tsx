import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, HelperText, Icon, IconButton, Text, TextInput } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { lookupProductCode, type ProductCodeLookup } from '@/features/inventory/api';
import { userErrorMessage } from '@/utils/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSaleStock } from '@/features/sales/api';
import { useSaleCart } from '@/stores/saleCart';
import { emitScanFeedback } from '@/utils/scanFeedback';

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
  const [success, setSuccess] = useState('');
  const lastScan = useRef({ code: '', at: 0 });
  const lockedRef = useRef(false);
  const addToCart = useSaleCart(state => state.add);
  const saleStock = useQuery({
    queryKey: ['sale-stock', membership?.companyId ?? '', membership?.storeId ?? '', employee],
    queryFn: () => getSaleStock(membership?.companyId ?? '', membership?.storeId ?? '', !employee),
    enabled: mode === 'sale' && !!membership?.companyId && !!membership?.storeId,
    staleTime: 60_000,
  });

  const unlock=useCallback(()=>{lockedRef.current=false;setLocked(false);},[]);
  const reset = useCallback(() => {
    setMissing('');
    setConflict(null);
    setError('');
    setSuccess('');
    lastScan.current = { code: '', at: 0 };
    setTimeout(unlock, 250);
  }, [unlock]);

  const find = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    const now = Date.now();
    if (!code || lockedRef.current || (lastScan.current.code === code && now - lastScan.current.at < 1800)) return;
    if (code.length > 160) {
      setError('Ce code est trop long ou invalide.');
      lockedRef.current=true;
      setLocked(true);
      return;
    }
    lastScan.current = { code, at: now };
    lockedRef.current=true;
    setLocked(true);
    setError('');
    setSuccess('');
    setMissing('');
    setConflict(null);
    try {
      const found = await lookupProductCode(code, membership?.storeId ?? '', membership?.companyId ?? '');
      if (found) {
        if (!found.isActive || found.storeId !== membership?.storeId) {
          setConflict(found);
          return;
        }
        if (mode === 'sale') {
          const item = saleStock.data?.find(row => row.productId === found.productId && row.variantId === found.variantId);
          if (!item) {
            setError(saleStock.isLoading ? 'Chargement du catalogue… Réessayez dans un instant.' : 'Produit trouvé, mais indisponible dans cette boutique.');
            emitScanFeedback('error', 'Produit indisponible');
            setTimeout(unlock, 900);
            return;
          }
          if (item.available <= 0) {
            setError('Produit trouvé, mais le stock est épuisé.');
            emitScanFeedback('error', 'Stock épuisé');
            setTimeout(unlock, 900);
            return;
          }
          addToCart(item);
          setManual('');
          setSuccess(`Produit trouvé · ${item.name} ajouté au panier`);
          emitScanFeedback('success', `${item.name} ajouté au panier`);
          setTimeout(() => {
            unlock();
            setSuccess('Prêt pour le produit suivant');
          }, 650);
          return;
        }
        else if(mode==='inventory')router.replace({pathname:'/inventory-count' as never,params:{inventoryId:inventoryId??'',productId:found.productId}});
        else router.replace(`/products/${found.productId}` as never);
        emitScanFeedback('success', 'Produit trouvé');
        return;
      }
      setMissing(code);
      emitScanFeedback('error', 'Produit introuvable');
    } catch (scanError) {
      setError(userErrorMessage(scanError, 'Recherche impossible. Réessayez.'));
      emitScanFeedback('error', 'Recherche impossible');
    }
  }, [addToCart, inventoryId, membership?.companyId, membership?.storeId, mode, saleStock.data, saleStock.isLoading, unlock]);

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
      <View style={[styles.status, !!success && styles.statusSuccess, (!!error || !!missing) && styles.statusError]}><Text style={styles.statusText}>{success || (missing ? 'Produit introuvable' : error) || (locked ? 'Lecture en cours…' : 'Placez le code dans le cadre')}</Text></View>
    </View>}
    <TextInput mode="outlined" label={Platform.OS === 'web' ? 'Scanner USB ou saisie du code-barres' : 'Saisir le code-barres'} value={manual} onChangeText={setManual} autoCapitalize="characters" maxLength={160} autoFocus={Platform.OS === 'web'} blurOnSubmit={false} onSubmitEditing={() => void find(manual)} />
    <AppButton mode="outlined" loading={locked && !missing && !error} disabled={!manual.trim() || locked} onPress={() => void find(manual)}>Rechercher</AppButton>
    {mode === 'sale' && <AppButton icon="cart-check" onPress={() => router.replace((employee ? '/employee/sales/new' : '/sales/new') as never)}>Retour au panier</AppButton>}
    {!!success && <HelperText type="info" visible>{success}</HelperText>}
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
  statusSuccess: { backgroundColor: 'rgba(17,100,58,0.94)' },
  statusError: { backgroundColor: 'rgba(180,35,24,0.94)' },
  statusText: { color: '#fff' },
  unknown: { gap: 10 },
});
