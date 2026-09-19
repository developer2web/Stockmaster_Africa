import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase/client';

const bucket = 'product-images';
const MAX_WIDTH = 1280;
const UNREADABLE = 'Cette image ne peut pas être lue. Choisissez un fichier PNG, JPEG ou WebP valide.';

// Sur le web, la sélection renvoie un lien blob:. On redimensionne et compresse avec
// createImageBitmap + canvas plutôt qu'avec expo-image-manipulator : celui-ci charge l'image
// via un élément <Image> dont l'échec rejette avec le <canvas> lui-même (« [object
// HTMLCanvasElement] », sans message exploitable), et il agrandit aussi les petites images.
// On lit le fichier choisi directement (asset.file) : pas de fetch(blob:), qu'une politique de
// sécurité (connect-src) peut interdire.
async function optimizeOnWeb(uri: string, file?: Blob): Promise<ArrayBuffer> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file ?? await (await fetch(uri)).blob());
  } catch {
    throw new Error(UNREADABLE);
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(UNREADABLE);
  // Fond blanc : un PNG transparent deviendrait noir en JPEG.
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error(UNREADABLE);
  return blob.arrayBuffer();
}

async function optimizeOnDevice(uri: string, sourceWidth: number): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  if (sourceWidth > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  return (await fetch(optimized.uri)).arrayBuffer();
}

async function pick(source: 'camera' | 'library') {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(source === 'camera' ? 'Autorisez l’accès à la caméra.' : 'Autorisez l’accès à vos photos.');
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  return result.canceled ? null : { uri: result.assets[0].uri, width: result.assets[0].width, file: result.assets[0].file };
}

function storagePath(url: string) {
  const marker = `/storage/v1/object/authenticated/${bucket}/`;
  const index = url.indexOf(marker);
  return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export async function uploadProductImage(source: 'camera' | 'library', companyId: string, storeId: string, productId: string) {
  const picked = await pick(source);
  if (!picked) return null;
  let bytes: ArrayBuffer;
  try {
    bytes = Platform.OS === 'web' ? await optimizeOnWeb(picked.uri, picked.file) : await optimizeOnDevice(picked.uri, picked.width);
  } catch (error) {
    // Toujours une vraie erreur avec un message : le composant l'affiche à l'utilisateur.
    throw error instanceof Error ? error : new Error(UNREADABLE);
  }
  const path = `${companyId}/${storeId}/${productId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/authenticated/${bucket}/${path}`;
}

export async function deleteProductImage(url: string) {
  const path = storagePath(url);
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}

export async function updateProductImages(productId: string, urls: string[]) {
  if (urls.length > 2) throw new Error('Deux images maximum sont autorisées.');
  const { error } = await supabase.from('products').update({ image_urls: urls, image_url: urls[0] ?? null }).eq('id', productId);
  if (error) throw new Error(error.message);
}
