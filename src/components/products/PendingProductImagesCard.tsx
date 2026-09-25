import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Card, HelperText, IconButton, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { CAMERA_NOTICE, cameraUnavailable, pickProductImage, type PickedImage } from '@/features/products/images';
import { readableError } from '@/utils/errors';

export type PendingImage = PickedImage;

/**
 * Sélection d'images pour un produit pas encore enregistré (retour testeur du 24/09 : « pourquoi
 * faut-il enregistrer avant d'ajouter une image ? »). Chaque image envoyée en stockage a besoin de
 * l'identifiant du produit dans son chemin, qui n'existe qu'après l'insertion en base — les images
 * sont donc seulement choisies et prévisualisées ici (état local, rien envoyé), et c'est
 * ProductFormScreen qui les envoie réellement juste après avoir obtenu cet identifiant à
 * l'enregistrement (voir uploadPreparedImage). Un échec d'envoi à ce moment-là n'empêche pas le
 * produit d'être enregistré : seule la photo reste à réessayer, depuis la fiche déjà créée.
 */
export function PendingProductImagesCard({ images, onChange }: { images: PendingImage[]; onChange: (images: PendingImage[]) => void }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const pick = async (source: 'camera' | 'library') => {
    if (source === 'camera' && cameraUnavailable()) { setNotice(CAMERA_NOTICE); return; }
    setNotice(''); setError(''); setPicking(true);
    try {
      const picked = await pickProductImage(source);
      if (picked) onChange([...images, picked]);
    } catch (caught) {
      setError(readableError(caught, 'Impossible de choisir cette image. Réessayez.'));
    } finally {
      setPicking(false);
    }
  };
  const remove = (index: number) => onChange(images.filter((_, i) => i !== index));
  return <Card mode="outlined">
    <Card.Title title="Images du produit" subtitle={`${images.length}/2 • facultatives, ajoutées à l’enregistrement`} />
    <Card.Content style={styles.content}>
      {images.map((image, index) => { const label = index === 0 ? 'Image principale' : 'Deuxième image'; return <View key={image.uri} style={styles.imageRow}>
        <Image source={{ uri: image.uri }} style={styles.thumb} contentFit="cover" />
        <View style={styles.actions}><Text variant="labelLarge">{label}</Text></View>
        <IconButton icon="close" accessibilityLabel={`Retirer ${label.toLowerCase()}`} onPress={() => remove(index)} />
      </View>; })}
      {!images.length && <Text>Aucune image choisie pour l’instant.</Text>}
      {images.length < 2 && <View style={styles.add}><AppButton mode="outlined" icon="camera" loading={picking} onPress={() => pick('camera')}>Photo</AppButton><AppButton mode="outlined" icon="image-plus" loading={picking} onPress={() => pick('library')}>Galerie</AppButton></View>}
      {!!notice && <HelperText type="info" visible>{notice}</HelperText>}
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
    </Card.Content>
  </Card>;
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: 13 },
  actions: { flex: 1, minWidth: 150 },
  add: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
