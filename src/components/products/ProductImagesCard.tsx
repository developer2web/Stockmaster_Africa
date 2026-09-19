import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Card, HelperText, IconButton, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { ProductThumbnail } from './ProductThumbnail';
import { deleteProductImage, updateProductImages, uploadProductImage } from '@/features/products/images';
import { readableError } from '@/utils/errors';

// Sur un ordinateur, le navigateur n'a pas de mode « prendre une photo » : sans ce message, le
// bouton Photo semblait ne rien faire. Un navigateur de téléphone ou de tablette garde la vraie capture (détecté par son user-agent : un écran tactile
// ne suffit pas, beaucoup d'ordinateurs et de navigateurs automatisés en déclarent un).
const cameraUnavailable = () => Platform.OS === 'web' && !(typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
const CAMERA_NOTICE = 'L’appareil photo n’est pas disponible depuis un ordinateur. Utilisez « Galerie » pour choisir une image.';

export function ProductImagesCard({ productId, companyId, storeId, urls }: { productId: string; companyId: string; storeId: string; urls: string[] }) {
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const pickImage = (source: 'camera' | 'library', replace?: string) => {
    if (source === 'camera' && cameraUnavailable()) { setNotice(CAMERA_NOTICE); return; }
    setNotice('');
    save.mutate({ source, replace });
  };
  const save = useMutation({
    mutationFn: async ({ source, replace }: { source: 'camera' | 'library'; replace?: string }) => {
      const uploaded = await uploadProductImage(source, companyId, storeId, productId);
      if (!uploaded) return;
      const next = replace ? urls.map((url) => url === replace ? uploaded : url) : [...urls, uploaded];
      await updateProductImages(productId, next);
      if (replace) await deleteProductImage(replace);
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['product', productId] }),
  });
  const remove = useMutation({
    mutationFn: async (url: string) => {
      await updateProductImages(productId, urls.filter((item) => item !== url));
      await deleteProductImage(url);
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['product', productId] }),
  });
  return <Card mode="outlined">
    <Card.Title title="Images du produit" subtitle={`${urls.length}/2 • facultatives`} />
    <Card.Content style={styles.content}>
      {urls.map((url, index) => { const imageLabel = index === 0 ? 'Image principale' : 'Deuxième image'; return <View key={url} style={styles.imageRow}>
        <ProductThumbnail url={url} size={92} />
        <View style={styles.actions}><Text variant="labelLarge">{imageLabel}</Text><View style={styles.buttons}><IconButton icon="camera" accessibilityLabel={`Remplacer ${imageLabel.toLowerCase()} par une photo`} onPress={() => pickImage('camera', url)} /><IconButton icon="image-edit" accessibilityLabel={`Remplacer ${imageLabel.toLowerCase()} depuis la galerie`} onPress={() => pickImage('library', url)} /><IconButton icon="delete-outline" iconColor="#C92A2A" accessibilityLabel={`Supprimer ${imageLabel.toLowerCase()}`} onPress={() => remove.mutate(url)} /></View></View>
      </View>; })}
      {!urls.length && <Text>Aucune image. Un visuel par défaut sera affiché.</Text>}
      {urls.length < 2 && <View style={styles.add}><AppButton mode="outlined" icon="camera" loading={save.isPending} onPress={() => pickImage('camera')}>Photo</AppButton><AppButton mode="outlined" icon="image-plus" loading={save.isPending} onPress={() => pickImage('library')}>Galerie</AppButton></View>}
      {!!notice && <HelperText type="info" visible>{notice}</HelperText>}
      {(save.error || remove.error) && <HelperText type="error" visible>{readableError(save.error ?? remove.error, 'Impossible de traiter cette image. Réessayez avec une autre image.')}</HelperText>}
    </Card.Content>
  </Card>;
}

const styles = StyleSheet.create({ content: { gap: 14 }, imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' }, actions: { flex: 1, minWidth: 150 }, buttons: { flexDirection: 'row', flexWrap: 'wrap' }, add: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } });
