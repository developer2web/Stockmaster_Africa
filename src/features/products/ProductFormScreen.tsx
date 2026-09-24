import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Dialog, HelperText, Icon, Portal, Switch, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DIALOG_TITLE_PADDING, DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { useLeaveGuard } from '@/components/ui/leaveGuard';
import { plural } from '@/utils/plural';
import { ProductImagesCard } from '@/components/products/ProductImagesCard';
import { StockAdjustmentDialog } from '@/components/products/StockAdjustmentDialog';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { ResponsiveFormGrid } from '@/components/forms/ResponsiveFormGrid';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';
import { getStockLevels } from '@/features/inventory/api';
import { useStockRealtime } from '@/hooks/useStockRealtime';
import { canAutofill, lotMargin, lotPriceFromUnit, unitPriceFromLot } from './bulkPricing';
import { ProductFieldError, deleteProduct, deleteVariant, findSimilarProduct, getProduct, getSuppliers, saveProduct, saveVariant } from './api';
import { lookupOpenFoodFacts, type OpenFoodFactsMatch } from './openFoodFacts';
import { productSchema, ProductInput, variantSchema, VariantInput } from '@/schemas/catalog';
import type { ProductVariant } from '@/types/database';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { formatQuantity, numericFieldValue, parseWholeNumber } from '@/utils/number';
import { invalidateOperationalSummaries, invalidateProductCaches } from '@/utils/queryInvalidation';
import { readableError } from '@/utils/errors';

const defaults: ProductInput = { name:'', description:'', sku:'', barcode:'',  supplierId:null, unit:'piece', purchasePrice:'', salePrice:'', initialQuantity:'0', lowStockThreshold:'5', isActive:true, bulkEnabled:false, bulkUnitLabel:'', bulkQuantity:'', bulkPrice:'', bulkPurchasePrice:'' };
const unitOptions = [
  { label:'Pièce', value:'piece' }, { label:'Carton', value:'carton' },
  { label:'Kilogramme', value:'kg' }, { label:'Litre', value:'litre' },
  { label:'Sac', value:'sac' }, { label:'Paquet', value:'paquet' },
] as const;
const additionalFields = ['description', 'sku', 'barcode', 'supplierId', 'unit', 'lowStockThreshold', 'isActive'] as const;

export function ProductFormScreen({ id,initialBarcode,basePath='/products',returnTo }: { id?: string;initialBarcode?:string;basePath?:string;returnTo?:string }) {
  const { formatMoney,primaryCode } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const qc = useQueryClient();
  useStockRealtime(company);
  const product = useQuery({ queryKey:['product',id], queryFn:()=>getProduct(id!), enabled:!!id });
  const suppliers = useQuery({ queryKey:['suppliers',company,store], queryFn:()=>getSuppliers(company,store), enabled:!!company&&!!store });
  const { control, handleSubmit, reset, setValue, getValues, trigger, setError, watch, formState:{errors,isDirty,isValid,dirtyFields} } = useForm({ resolver:zodResolver(productSchema), defaultValues:{...defaults,barcode:initialBarcode??''},mode:'onChange' });
  const levels = useQuery({queryKey:['stock-levels',company,store,id],queryFn:()=>getStockLevels(company,id,store),enabled:!!company&&!!store&&!!id});
  // Prix par unité dans le lot, calculé en direct pour que le vendeur voie
  // tout de suite s'il vend vraiment moins cher en gros — sans avoir à
  // sortir une calculette.
  const [bulkEnabledValue, bulkUnitLabelValue, bulkQuantityValue, bulkPriceValue, bulkPurchasePriceValue, salePriceValue, purchasePriceValue] = useWatch({ control, name: ['bulkEnabled', 'bulkUnitLabel', 'bulkQuantity', 'bulkPrice', 'bulkPurchasePrice', 'salePrice', 'purchasePrice'] });
  // Saisies strictes : une valeur vide, négative, décimale ou mal écrite vaut
  // null — le calcul est alors masqué au lieu d'afficher « NaN » ou un chiffre
  // faux calculé sur une valeur que le formulaire refuse de toute façon.
  const bulkQuantityNumber = parseWholeNumber(bulkQuantityValue);
  const bulkPriceNumber = parseWholeNumber(bulkPriceValue);
  const purchaseNumber = parseWholeNumber(purchasePriceValue);
  const saleNumber = parseWholeNumber(salePriceValue);
  const perUnitBulkPrice = bulkQuantityNumber !== null && bulkQuantityNumber > 0 && bulkPriceNumber !== null ? bulkPriceNumber / bulkQuantityNumber : 0;
  // Marge en direct sous les prix : on veut que l'erreur de saisie (prix de
  // vente sous le prix d'achat) saute aux yeux tout de suite, pas seulement
  // après enregistrement sur la fiche complète.
  const marginKnown = purchaseNumber !== null && saleNumber !== null;
  const liveMargin = marginKnown ? saleNumber - purchaseNumber : 0;
  const liveMarginPercent = marginKnown && purchaseNumber > 0 ? (liveMargin / purchaseNumber) * 100 : null;
  // Les 3 champs du lot sont liés par une seule règle (tout ou rien) : sans
  // ça, remplir la quantité et le prix après le nom ne fait pas disparaître
  // l'erreur affichée sur le nom tant qu'on n'y retouche pas soi-même.
  useEffect(() => { if (bulkEnabledValue) void trigger(['bulkUnitLabel', 'bulkQuantity', 'bulkPrice']); }, [bulkEnabledValue, bulkUnitLabelValue, bulkQuantityValue, bulkPriceValue, trigger]);
  // Un vendeur qui pense d'abord « lot » (prix payé au fournisseur pour un
  // carton, prix de vente du carton) ne devrait pas avoir à recalculer et
  // retaper les prix à l'unité en haut : on les déduit de prix du lot ÷
  // quantité, tant que la personne ne les a pas saisis elle-même. On compare
  // la valeur du champ à la dernière valeur calculée (canAutofill) plutôt que
  // de se fier à l'état « modifié » du formulaire : le prix suit ainsi la
  // quantité à chaque changement (240 000 ÷ 24 = 10 000, puis ÷ 12 = 20 000).
  const autoPurchase = useRef<string | null>(null);
  const autoSale = useRef<string | null>(null);
  const lotPurchaseEdited = !!dirtyFields.bulkPurchasePrice;
  useEffect(() => {
    if (!bulkEnabledValue) return;
    const target = unitPriceFromLot(bulkPurchasePriceValue, bulkQuantityValue);
    if (target === null) return;
    const current = getValues('purchasePrice');
    // Création : le prix du lot pilote le prix d'achat tant qu'il n'a pas été saisi à la main.
    // Fiche existante : seulement une fois que la personne a elle-même modifié le prix d'achat
    // du lot (jamais en ouvrant la fiche ni en changeant la quantité seule, pour ne pas
    // écraser un prix enregistré).
    if (id ? !lotPurchaseEdited : !canAutofill(current, autoPurchase.current)) return;
    if (current !== target) setValue('purchasePrice', target, { shouldDirty: !!id, shouldValidate: true });
    autoPurchase.current = target;
  }, [id, bulkEnabledValue, bulkPurchasePriceValue, bulkQuantityValue, lotPurchaseEdited, getValues, setValue]);
  // Fiche existante, prix du lot pas encore modifié : le prix d'achat du lot affiché reste
  // égal au prix à l'unité enregistré × la quantité par lot (il n'est pas stocké à part).
  useEffect(() => {
    if (!id || !bulkEnabledValue || lotPurchaseEdited) return;
    const lot = lotPriceFromUnit(purchasePriceValue, bulkQuantityValue);
    if (lot !== null && getValues('bulkPurchasePrice') !== lot) setValue('bulkPurchasePrice', lot, { shouldDirty: false });
  }, [id, bulkEnabledValue, lotPurchaseEdited, purchasePriceValue, bulkQuantityValue, getValues, setValue]);
  useEffect(() => {
    if (id || !bulkEnabledValue) return;
    const target = unitPriceFromLot(bulkPriceValue, bulkQuantityValue);
    if (target === null) return;
    const current = getValues('salePrice');
    if (!canAutofill(current, autoSale.current)) return;
    if (current !== target) setValue('salePrice', target, { shouldDirty: false, shouldValidate: true });
    autoSale.current = target;
  }, [id, bulkEnabledValue, bulkPriceValue, bulkQuantityValue, getValues, setValue]);
  // Coût d'achat du lot : le prix saisi, sinon prix à l'unité × quantité. Sert à prévenir d'une
  // vente en gros à perte, comme pour la vente au détail.
  const lotCost = (bulkPurchasePriceValue ?? '').trim() !== '' ? bulkPurchasePriceValue : lotPriceFromUnit(purchasePriceValue, bulkQuantityValue);
  const lotResult = bulkEnabledValue ? lotMargin(bulkPriceValue, lotCost) : null;

  useEffect(() => { if (product.data) reset({ name:product.data.name, description:product.data.description??'', sku:product.data.sku ?? '', barcode:product.data.barcode??'', supplierId:product.data.supplier_id, unit:product.data.unit??'piece', purchasePrice:numericFieldValue(product.data.purchase_price), salePrice:numericFieldValue(product.data.sale_price), initialQuantity:'0', lowStockThreshold:numericFieldValue(product.data.low_stock_threshold), isActive:product.data.is_active, bulkEnabled:!!product.data.bulk_unit_label, bulkUnitLabel:product.data.bulk_unit_label??'', bulkQuantity:product.data.bulk_quantity!=null?String(product.data.bulk_quantity):'', bulkPrice:product.data.bulk_price!=null?numericFieldValue(product.data.bulk_price):'', bulkPurchasePrice:(product.data.bulk_quantity!=null&&product.data.purchase_price!=null)?String(Math.round(Number(product.data.purchase_price)*Number(product.data.bulk_quantity))):'' }); }, [product.data,reset]);

  // Nouveau produit arrivant du scanner avec un code inconnu : on tente de retrouver son
  // nom (et une photo de référence) dans Open Food Facts pour accélérer la saisie. Ça reste
  // une suggestion à vérifier — jamais les prix/stock, propres à chaque entreprise — et un
  // échec ou une absence de résultat ne change rien : le champ reste vide, saisie manuelle normale.
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'none'>('idle');
  const [lookupMatch, setLookupMatch] = useState<OpenFoodFactsMatch | null>(null);
  useEffect(() => {
    if (id || !initialBarcode) return;
    let cancelled = false;
    setLookup('loading');
    lookupOpenFoodFacts(initialBarcode).then(match => {
      if (cancelled) return;
      if (match) {
        setLookupMatch(match);
        setLookup('found');
        if (!getValues('name').trim()) setValue('name', match.name, { shouldDirty: true, shouldValidate: true });
      } else {
        setLookup('none');
      }
    });
    return () => { cancelled = true; };
  }, [id, initialBarcode, getValues, setValue]);

  // Retour avec des modifications non enregistrées : on demande d'abord
  // confirmation — bouton Retour de l'en-tête (requestLeave), geste ou bouton
  // système qui retire l'écran (usePreventRemove), et actualisation ou
  // fermeture de l'onglet sur le web (beforeunload). Les sorties voulues
  // (après enregistrement ou suppression) lèvent le garde via leaveAllowed.
  const navigation = useNavigation();
  const leaveAllowed = useRef(false);
  const [leaveProceed, setLeaveProceed] = useState<(() => void) | null>(null);
  usePreventRemove(isDirty, ({ data }) => {
    if (leaveAllowed.current) navigation.dispatch(data.action);
    else setLeaveProceed(() => () => navigation.dispatch(data.action));
  });
  const requestLeave = (proceed: () => void) => {
    if (!isDirty || leaveAllowed.current) proceed();
    else setLeaveProceed(() => proceed);
  };
  useLeaveGuard(isDirty, requestLeave);
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (leaveAllowed.current) return; event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);
  // Brouillon (création, web) : les saisies sont gardées dans sessionStorage — propre à l'onglet,
  // qui survit à une actualisation mais pas à sa fermeture. Une actualisation ne fait donc plus
  // perdre le formulaire ; le brouillon est effacé à l'enregistrement, quand on quitte volontairement,
  // ou via « Repartir de zéro ».
  const draftKey = `stockmaster.product-draft.${company}.${store}`;
  const draftEnabled = Platform.OS === 'web' && !id && !initialBarcode && !!company && !!store;
  const draftReady = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const clearDraft = () => { try { window.sessionStorage.removeItem(draftKey); } catch { /* stockage indisponible : sans effet */ } };
  useEffect(() => {
    if (!draftEnabled || draftReady.current) return;
    draftReady.current = true;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(draft)) if (key in defaults) setValue(key as keyof ProductInput, value as never, { shouldDirty: true, shouldValidate: true });
      setDraftRestored(true);
    } catch { /* brouillon illisible : on repart d'un formulaire vide */ }
  }, [draftEnabled, draftKey, setValue]);
  useEffect(() => {
    if (!draftEnabled) return;
    const subscription = watch((values) => {
      if (!draftReady.current) return;
      try {
        // Formulaire revenu à son état initial : rien à garder.
        if (Object.entries(defaults).every(([key, initial]) => values[key as keyof ProductInput] === initial)) window.sessionStorage.removeItem(draftKey);
        else window.sessionStorage.setItem(draftKey, JSON.stringify(values));
      } catch { /* stockage plein ou indisponible */ }
    });
    return () => subscription.unsubscribe();
  }, [draftEnabled, draftKey, watch]);
  const [pendingSave,setPendingSave] = useState<ProductInput|null>(null);
  const [similarProduct,setSimilarProduct] = useState<{id:string;name:string}|null>(null);
  const [checkingDuplicate,setCheckingDuplicate] = useState(false);
  const save = useMutation({ mutationFn:(v:ProductInput)=>saveProduct(company,store,v,id), onError:(error)=>{ if(error instanceof ProductFieldError)setError(error.field,{type:'server',message:error.fieldMessage},{shouldFocus:true}) }, onSuccess:async(saved)=>{ clearDraft(); leaveAllowed.current=true; await Promise.all([invalidateProductCaches(qc,company,store,saved),qc.invalidateQueries({queryKey:['stock-levels',company,store]}),invalidateOperationalSummaries(qc,company,store)]); if(returnTo)router.replace({pathname:returnTo as never,params:{productId:saved,scanToken:String(Date.now())}});else router.replace({pathname:basePath as never,params:{notice:id?'produit_modifie':'produit_enregistre'}}); } });
  // Une erreur d'enregistrement (doublon, réseau...) ne doit pas rester affichée une fois le
  // formulaire modifié : la personne est en train de la corriger.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const subscription = watch(() => { if (saveRef.current.isError) saveRef.current.reset(); });
    return () => subscription.unsubscribe();
  }, [watch]);
  const [confirm,setConfirm] = useState(false);
  const [moreOpen,setMoreOpen] = useState(false);
  const hasAdditionalErrors = additionalFields.some(field => !!errors[field]);
  useEffect(() => {
    if (hasAdditionalErrors) setMoreOpen(true);
  }, [hasAdditionalErrors]);
  const [adjust,setAdjust] = useState<'in'|'out'|null>(null);
  const remove = useMutation({ mutationFn:()=>deleteProduct(id!), onSuccess:async()=>{ leaveAllowed.current=true; await Promise.all([qc.invalidateQueries({queryKey:['products',company]}),qc.invalidateQueries({queryKey:['employee-products',company]}),qc.invalidateQueries({queryKey:['employee-catalog-products',company]})]); router.replace(basePath as never); } });
  const stockQuantity=(levels.data??[]).reduce((sum,row)=>sum+Number(row.quantity),0);
  const margin=product.data?Number(product.data.sale_price)-Number(product.data.purchase_price):0;
  const stockValue=product.data?stockQuantity*Number(product.data.purchase_price):0;
  const canAdjustStock=hasPermission(membership,'stock_movements.write');
  const productImages = Array.isArray(product.data?.image_urls)
    ? product.data.image_urls.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : product.data?.image_url ? [product.data.image_url] : [];
  const productVariants = Array.isArray(product.data?.product_variants) ? product.data.product_variants : [];

  return <AdminPage title={id?'Fiche produit':'Nouveau produit'} backTo={returnTo ? undefined : basePath} onBackPress={requestLeave}>
    {!company||!store?<HelperText type="error" visible>Sélectionnez une entreprise et une boutique avant d’enregistrer un produit.</HelperText>:null}
    {/* Avant ce garde, le formulaire s'affichait tout de suite avec ses valeurs
        par défaut (nom vide, prix à 0) le temps que la fiche charge, puis se
        remplissait d'un coup — au premier coup d'œil ça ressemblait à une
        fiche produit cassée. On attend maintenant les données avant d'afficher
        le formulaire en modification (la création, elle, n'a rien à charger). */}
    {id && product.isLoading && <Text>Chargement du produit…</Text>}
    {!!product.error && <><HelperText type="error" visible>{readableError(product.error)}</HelperText><AppButton mode="text" onPress={() => void product.refetch()}>Réessayer le chargement</AppButton></>}
    {!!levels.error&&<HelperText type="error" visible>{readableError(levels.error)}</HelperText>}
    {(!id || product.data) && <View style={styles.form}>
      {draftRestored && <Card mode="outlined"><Card.Content style={styles.draftBanner}><Text style={styles.draftText}>Brouillon restauré : vos dernières saisies non enregistrées ont été rechargées.</Text><AppButton compact mode="text" onPress={() => { clearDraft(); reset({ ...defaults, barcode: initialBarcode ?? '' }); setDraftRestored(false); }}>Repartir de zéro</AppButton></Card.Content></Card>}
      <Card mode="outlined">
        <Card.Content style={[styles.formContent, styles.essentialFields]}>
          <FormField control={control} name="name" label="Nom du produit" required autoFocus />
          {!id && lookup === 'loading' && <HelperText type="info" visible>Recherche du produit à partir du code-barres…</HelperText>}
          {!id && lookup === 'found' && lookupMatch && <View style={styles.lookupFound}>
            {!!lookupMatch.imageUrl && <Image source={{ uri: lookupMatch.imageUrl }} style={styles.lookupImage} />}
            <Text variant="bodySmall" style={styles.lookupText}>Nom suggéré depuis une base de données publique{lookupMatch.brand ? ` (${lookupMatch.brand})` : ''} — vérifiez qu’il correspond avant d’enregistrer.</Text>
          </View>}
          <ResponsiveFormGrid>
            <FormField control={control} name="purchasePrice" label={`Prix d’achat (${primaryCode})`} required keyboardType="number-pad" selectTextOnFocus />
            <FormField control={control} name="salePrice" label={`Prix de vente (${primaryCode})`} required keyboardType="number-pad" selectTextOnFocus />
          </ResponsiveFormGrid>
          {marginKnown && (purchaseNumber > 0 || saleNumber > 0) && <HelperText type={liveMargin <= 0 ? 'error' : 'info'} visible>
            {liveMargin < 0
              ? `Attention : le prix de vente est inférieur au prix d’achat (${formatMoney(liveMargin)}).`
              : liveMargin === 0
                ? 'Aucune marge à ce prix : vente au prix d’achat.'
                // SM-21 (audit externe), libellés corrigés sur demande explicite
                // du propriétaire : ce pourcentage divise la marge par le prix
                // d'achat (marge ÷ coût) — c'est un taux de marge, pas un taux
                // de marque (marge ÷ prix de vente, l'autre grandeur). Indicateurs
                // du produit (fiche existante) affiche déjà les deux, nommés pareil.
                : `Marge : ${formatMoney(liveMargin)}${liveMarginPercent !== null ? ` (taux de marge : ${liveMarginPercent.toFixed(1).replace('.', ',')} %)` : ''}`}
          </HelperText>}
          {!id && <FormField control={control} name="initialQuantity" label="Stock initial" required keyboardType="number-pad" selectTextOnFocus />}
        </Card.Content>
      </Card>
      {id && product.data && <ProductImagesCard productId={id} companyId={company} storeId={store} urls={productImages} />}
      {!id && <Card mode="outlined">
        <Card.Title title="Images du produit" subtitle="facultatives" />
        <Card.Content style={styles.formContent}>
          {/* Retour testeur du 24/09 (« pourquoi faut-il enregistrer avant d'ajouter une
              image ? ») : chaque image est rangée dans le stockage sous l'identifiant du
              produit, qui n'existe qu'après l'enregistrement — le texte l'explique
              maintenant au lieu de se contenter d'annoncer la contrainte. */}
          <Text variant="bodyMedium">Chaque image est associée à la fiche du produit une fois créée : enregistrez d’abord le produit, vous pourrez ensuite en ajouter ici.</Text>
        </Card.Content>
      </Card>}
      {!productVariants.length && <Controller control={control} name="bulkEnabled" render={({ field: bulkField }) => <Card mode="outlined">
        <Card.Title title="Vendre aussi en gros" subtitle="Ex : un carton de 24, un sac de 50 kg" left={props => <Icon {...props} source="package-variant-closed" />} right={() => <Switch value={bulkField.value} onValueChange={bulkField.onChange} accessibilityLabel="Vendre aussi en gros" style={{ marginRight: 12 }} />} />
        {bulkField.value && <Card.Content style={styles.formContent}>
          <Text variant="bodySmall">Le vendeur touchera deux boutons à la vente (détail / gros) avec le bon prix déjà calculé — aucun calcul à faire à chaque vente.</Text>
          <ResponsiveFormGrid>
            <FormField control={control} name="bulkUnitLabel" label="Nom de l’unité de gros (ex : Carton, Sac)" required />
            <FormField control={control} name="bulkQuantity" label="Quantité par lot (ex : 24)" required keyboardType="number-pad" selectTextOnFocus />
          </ResponsiveFormGrid>
          {<Text variant="bodySmall" style={{ fontStyle: 'italic' }}>Astuce : si vous ne saisissez pas vous-même les prix à l’unité en haut, ils se calculent tout seuls à partir des prix du lot (prix du lot ÷ quantité par lot) et suivent la quantité. Un prix que vous avez saisi n’est jamais remplacé. Sur une fiche existante, le prix d’achat à l’unité ne change que si vous modifiez vous-même le prix d’achat du lot.</Text>}
          <ResponsiveFormGrid>
            {<FormField control={control} name="bulkPurchasePrice" label={`Prix d’achat du lot (${primaryCode}, facultatif)`} keyboardType="number-pad" selectTextOnFocus />}
            <FormField control={control} name="bulkPrice" label={`Prix de vente du lot (${primaryCode})`} required keyboardType="number-pad" selectTextOnFocus />
          </ResponsiveFormGrid>
          {perUnitBulkPrice > 0 && <HelperText type={perUnitBulkPrice > (saleNumber ?? 0) && (saleNumber ?? 0) > 0 ? 'error' : 'info'} visible>
            {perUnitBulkPrice > (saleNumber ?? 0) && (saleNumber ?? 0) > 0
              ? `Attention : ${formatMoney(perUnitBulkPrice)} par unité dans le lot, c’est plus cher que le prix au détail (${formatMoney(saleNumber ?? 0)}). Vérifiez le prix du lot.`
              : `Soit ${formatMoney(perUnitBulkPrice)} par unité dans le lot, contre ${formatMoney(saleNumber ?? 0)} au détail.`}
          </HelperText>}
          {lotResult && <HelperText type={lotResult.kind === 'loss' ? 'error' : 'info'} visible>
            {lotResult.kind === 'loss'
              ? `Attention : le prix de vente du lot (${formatMoney(bulkPriceNumber ?? 0)}) est inférieur à son prix d’achat (${formatMoney(parseWholeNumber(lotCost) ?? 0)}). Vous vendriez à perte (${formatMoney(lotResult.amount)}).`
              : lotResult.kind === 'none'
                ? 'Aucune marge sur le lot : vente au prix d’achat.'
                : `Marge sur le lot : ${formatMoney(lotResult.amount)}.`}
          </HelperText>}
        </Card.Content>}
      </Card>} />}
      {!!productVariants.length && <HelperText type="info" visible>La vente en gros n’est pas disponible sur un produit à variantes.</HelperText>}
      <Card mode="outlined">
        <Card.Content style={styles.formContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Options supplémentaires"
            accessibilityState={{ expanded: moreOpen }}
            aria-expanded={moreOpen}
            style={({ pressed }) => [styles.optionsToggle, pressed && styles.optionsTogglePressed]}
            onPress={() => setMoreOpen(value => !value)}
          >
            <Text variant="titleSmall" style={styles.optionsLabel}>Options supplémentaires</Text>
            <Icon source={moreOpen ? 'chevron-up' : 'chevron-down'} size={24} />
          </Pressable>
          <View style={[styles.formContent, !moreOpen && styles.collapsedOptions]}>
            <FormField control={control} name="description" label="Description (facultative)" multiline />
            <FormField control={control} name="barcode" label="Code-barres (facultatif)" keyboardType="numeric" />
            <FormField control={control} name="sku" label="Référence du produit (facultatif, généré automatiquement sinon)" />
            <ResponsiveFormGrid>
              <Controller control={control} name="unit" render={({ field, fieldState }) => <SelectField
                label="Unité"
                required
                value={field.value}
                options={[...unitOptions]}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />} />
              <Controller control={control} name="supplierId" render={({ field, fieldState }) => <SelectField
                label="Fournisseur"
                value={field.value}
                options={[{ label: 'Sans fournisseur', value: null }, ...(suppliers.data ?? []).filter(v => v.is_active).map(v => ({ label: v.name, value: v.id }))]}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />} />
              <FormField control={control} name="lowStockThreshold" label="Seuil de stock faible" required keyboardType="number-pad" selectTextOnFocus />
            </ResponsiveFormGrid>
            <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined">
              <Card.Title title="Produit actif" right={() => <Switch value={field.value} onValueChange={field.onChange} accessibilityLabel="Produit actif" style={{ marginRight: 12 }} />} />
            </Card>} />
            {id && <Variants productId={id} companyId={company} variants={productVariants} refresh={() => qc.invalidateQueries({ queryKey: ['product', id] })} />}
            {!id && <Text variant="bodyMedium">Vous pourrez ajouter des variantes depuis la fiche du produit après l’enregistrement.</Text>}
          </View>
        </Card.Content>
      </Card>
      {Object.keys(errors).length > 0 && <HelperText type="error" visible>
        {hasAdditionalErrors ? 'Vérifiez les champs signalés dans les options supplémentaires.' : 'Vérifiez les champs signalés avant d’enregistrer.'}
      </HelperText>}
      {!!save.error && !(save.error instanceof ProductFieldError) && <HelperText type="error" visible>{readableError(save.error)}</HelperText>}
      <AppButton
        icon="content-save"
        loading={save.isPending || checkingDuplicate}
        disabled={!company || !store || !isDirty || !isValid}
        onPress={handleSubmit(async v => {
          // Un nom identique (à la casse près) à un produit déjà actif dans cette
          // boutique n'est jamais bloqué (tailles/variantes différentes possibles) —
          // juste un signal avant de créer un doublon involontaire.
          if (!id) {
            setCheckingDuplicate(true);
            const match = await findSimilarProduct(company, store, v.name).catch(() => null);
            setCheckingDuplicate(false);
            if (match) { setSimilarProduct(match); setPendingSave(v); return; }
          }
          save.mutate(v);
        }, invalid => {
          if (additionalFields.some(field => !!invalid[field])) setMoreOpen(true);
        })}
      >Enregistrer</AppButton>
      {!!company && !!store && !isValid && Object.keys(errors).length === 0 && <HelperText type="info" visible>Renseignez les champs obligatoires (*) pour activer l’enregistrement.</HelperText>}
    </View>}
    <ConfirmDialog
      visible={!!leaveProceed}
      title="Quitter sans enregistrer ?"
      message="Vous avez des modifications non enregistrées. Si vous quittez maintenant, elles seront perdues."
      destructive
      cancelLabel="Rester"
      confirmLabel="Quitter sans enregistrer"
      onCancel={() => setLeaveProceed(null)}
      onConfirm={() => { const proceed = leaveProceed; setLeaveProceed(null); leaveAllowed.current = true; clearDraft(); proceed?.(); }}
    />
    <ConfirmDialog
      visible={!!similarProduct}
      title="Produit déjà existant ?"
      message={`Un produit nommé « ${similarProduct?.name} » existe déjà dans cette boutique. Créer quand même un nouveau produit distinct, ou annulez pour retrouver l’existant depuis la liste des produits.`}
      loading={save.isPending}
      onCancel={() => { setSimilarProduct(null); setPendingSave(null); }}
      onConfirm={() => { if (pendingSave) save.mutate(pendingSave); setSimilarProduct(null); }}
    />
    {id&&<Card mode="contained" style={{backgroundColor:stockQuantity>0?'#E1F1F2':'#FFF3E0'}}><Card.Title title="Stock de la boutique active" subtitle={membership?.storeName??'Boutique'} left={()=><Icon source="package-variant-closed" size={28} color="#084B50"/>}/><Card.Content style={{gap:8}}><Text variant="displaySmall" style={{fontWeight:'900',color:stockQuantity>0?'#084B50':'#C25B00'}}>{formatQuantity(stockQuantity)}</Text><Text>Valeur au prix d’achat : {formatMoney(stockValue)}</Text>{!canAdjustStock&&<Text>Vous pouvez consulter ce stock, mais votre rôle ne permet pas de le modifier.</Text>}</Card.Content>{canAdjustStock&&<Card.Actions><AppButton mode="contained" icon="plus" onPress={()=>setAdjust('in')}>Ajouter du stock</AppButton><AppButton mode="outlined" icon="minus" disabled={stockQuantity<=0} onPress={()=>setAdjust('out')}>Retirer</AppButton></Card.Actions>}</Card>}
    {/* SM-21 (audit externe), libellés corrigés sur demande explicite du
        propriétaire (définition standard française) :
        Taux de marge  = marge ÷ coût d'achat
        Taux de marque = marge ÷ prix de vente
        Les deux affichés côte à côte plutôt qu'un seul remplacé : chacun a
        un usage réel selon la question posée (rentabilité sur l'achat vs.
        part de la marge dans le prix affiché). */}
    {id&&product.data&&<Card mode="outlined"><Card.Title title="Indicateurs du produit"/><Card.Content style={{gap:6}}><Text>Marge unitaire : {formatMoney(margin)}</Text><Text>Taux de marge (marge ÷ coût) : {Number(product.data.purchase_price)>0?`${((margin/Number(product.data.purchase_price))*100).toFixed(1).replace('.',',')} %`:'Non calculable'}</Text><Text>Taux de marque (marge ÷ prix de vente) : {Number(product.data.sale_price)>0?`${((margin/Number(product.data.sale_price))*100).toFixed(1).replace('.',',')} %`:'Non calculable'}</Text><Text>Unité : {unitOptions.find(option=>option.value===product.data.unit)?.label??'Pièce'}</Text><Text>Valeur du stock : {formatMoney(stockValue)}</Text><Text>Fournisseur : {product.data.supplier?.name??'Sans fournisseur'}</Text></Card.Content></Card>}
    {id&&!!levels.data?.some(level=>level.variant)&&<Card><Card.Title title="Détail par variante"/><Card.Content>{levels.data.map(level=><Text key={level.id}>{level.variant?.name??'Produit simple'} : {formatQuantity(level.quantity)}</Text>)}</Card.Content></Card>}
    {id&&<AppButton mode="outlined" destructive icon="delete-outline" onPress={()=>setConfirm(true)}>Supprimer le produit</AppButton>}
    <ConfirmDialog visible={confirm} title="Supprimer ce produit ?" message="Cette action est refusée si le produit est déjà utilisé dans une opération." destructive loading={remove.isPending} onCancel={()=>setConfirm(false)} onConfirm={()=>remove.mutate()}/>
    {id&&<StockAdjustmentDialog visible={!!adjust} onDismiss={()=>setAdjust(null)} companyId={company} storeId={store} storeName={membership?.storeName} productId={id} currentQuantity={stockQuantity} initialDirection={adjust??'in'} variants={productVariants}/>}
  </AdminPage>;
}

const styles=StyleSheet.create({
  form:{width:'100%',maxWidth:720,alignSelf:'center',gap:14},
  formContent:{gap:8},
  essentialFields:{paddingTop:16},
  optionsToggle:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12},
  optionsTogglePressed:{opacity:0.7},
  optionsLabel:{flex:1},
  collapsedOptions:{display:'none'},
  lookupFound:{flexDirection:'row',alignItems:'center',gap:10},
  lookupImage:{width:36,height:36,borderRadius:6,backgroundColor:'#F1F5F4'},
  lookupText:{flex:1},
  draftBanner:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},
  draftText:{flex:1,minWidth:200},
});

function Variants({ productId, companyId, variants, refresh }: { productId:string; companyId:string; variants:ProductVariant[]; refresh:()=>Promise<unknown> }) {
  const [open,setOpen]=useState(false); const [editing,setEditing]=useState<ProductVariant|null>(null); const [deleting,setDeleting]=useState<ProductVariant|null>(null);
  const { control,handleSubmit,reset,formState:{errors,isValid} }=useForm<VariantInput>({resolver:zodResolver(variantSchema),defaultValues:{name:'',sku:'',barcode:'',purchasePrice:'',salePrice:'',isActive:true},mode:'onChange'});
  useEffect(()=>reset(editing?{name:editing.name,sku:editing.sku,barcode:editing.barcode??'',purchasePrice:numericFieldValue(editing.purchase_price),salePrice:numericFieldValue(editing.sale_price),isActive:editing.is_active}:{name:'',sku:'',barcode:'',purchasePrice:'',salePrice:'',isActive:true}),[editing,reset]);
  const save=useMutation({mutationFn:(v:VariantInput)=>saveVariant(companyId,productId,v,editing?.id),onSuccess:async()=>{await refresh();setOpen(false);setEditing(null)}});
  const remove=useMutation({mutationFn:()=>deleteVariant(deleting!.id),onSuccess:async()=>{await refresh();setDeleting(null)}});
  const show=(v?:ProductVariant)=>{setEditing(v??null);setOpen(true)};
  return <><Card><Card.Title title="Variantes" subtitle={`${variants.length} variante${plural(variants.length)}`} right={()=><AppButton compact mode="text" icon="plus" style={{marginRight:8}} onPress={()=>show()}>Ajouter</AppButton>}/><Card.Content>{variants.map(v=><Card key={v.id} mode="outlined" onPress={()=>show(v)} style={{marginBottom:8}}><Card.Title title={v.name} right={()=><AppButton mode="text" destructive onPress={()=>setDeleting(v)}>Retirer</AppButton>}/></Card>)}{!variants.length&&<Text>Aucune variante. Le produit simple reste utilisable.</Text>}</Card.Content></Card>
    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)}><DialogCloseButton onPress={()=>setOpen(false)}/><Dialog.Title style={DIALOG_TITLE_PADDING}>{editing?'Modifier la variante':'Nouvelle variante'}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView nestedScrollEnabled contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><FormField control={control} name="name" label="Nom" required/><FormField control={control} name="barcode" label="Code-barres"/><FormField control={control} name="purchasePrice" label="Prix d’achat spécifique" keyboardType="number-pad" selectTextOnFocus/><FormField control={control} name="salePrice" label="Prix de vente spécifique" keyboardType="number-pad" selectTextOnFocus/><Controller control={control} name="isActive" render={({field})=><Card mode="outlined"><Card.Title title="Variante active" right={()=><Switch value={field.value} onValueChange={field.onChange} accessibilityLabel="Variante active" style={{marginRight:12}}/>}/></Card>}/>{!!save.error&&<HelperText type="error" visible>{save.error.message}</HelperText>}{!isValid&&Object.keys(errors).length===0&&<HelperText type="info" visible>Renseignez le nom de la variante (obligatoire) pour l’enregistrer.</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton loading={save.isPending} disabled={!isValid||save.isPending} onPress={handleSubmit(v=>save.mutate(v))}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
    <ConfirmDialog visible={!!deleting} title="Supprimer la variante ?" message="Cette action est définitive." destructive loading={remove.isPending} onCancel={()=>setDeleting(null)} onConfirm={()=>remove.mutate()}/>
  </>;
}
