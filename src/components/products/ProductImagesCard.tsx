import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Card, HelperText, IconButton, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { ProductThumbnail } from './ProductThumbnail';
import { deleteProductImage, updateProductImages, uploadProductImage } from '@/features/products/images';

export function ProductImagesCard({ productId, companyId, storeId, urls }: { productId: string; companyId: string; storeId: string; urls: string[] }) {
  const cache = useQueryClient();
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
        <View style={styles.actions}><Text variant="labelLarge">{imageLabel}</Text><View style={styles.buttons}><IconButton icon="camera" accessibilityLabel={`Remplacer ${imageLabel.toLowerCase()} par une photo`} onPress={() => save.mutate({ source: 'camera', replace: url })} /><IconButton icon="image-edit" accessibilityLabel={`Remplacer ${imageLabel.toLowerCase()} depuis la galerie`} onPress={() => save.mutate({ source: 'library', replace: url })} /><IconButton icon="delete-outline" iconColor="#C92A2A" accessibilityLabel={`Supprimer ${imageLabel.toLowerCase()}`} onPress={() => remove.mutate(url)} /></View></View>
      </View>; })}
      {!urls.length && <Text>Aucune image. Un visuel par défaut sera affiché.</Text>}
      {urls.length < 2 && <View style={styles.add}><AppButton mode="outlined" icon="camera" loading={save.isPending} onPress={() => save.mutate({ source: 'camera' })}>Photo</AppButton><AppButton mode="outlined" icon="image-plus" loading={save.isPending} onPress={() => save.mutate({ source: 'library' })}>Galerie</AppButton></View>}
      {(save.error || remove.error) && <HelperText type="error" visible>{(save.error ?? remove.error)?.message}</HelperText>}
    </Card.Content>
  </Card>;
}

const styles = StyleSheet.create({ content: { gap: 14 }, imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' }, actions: { flex: 1, minWidth: 150 }, buttons: { flexDirection: 'row', flexWrap: 'wrap' }, add: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } });
