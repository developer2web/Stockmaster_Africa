import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase/client';

const bucket = 'product-images';
const MAX_WIDTH = 1280;
const MAX_BYTES = 3 * 1024 * 1024; // limite du bucket product-images
const UNSUPPORTED = 'Format non pris en charge. Choisissez une image PNG, JPEG ou WebP.';
const TOO_HEAVY = 'Cette image est trop lourde (3 Mo maximum) et n’a pas pu être réduite. Choisissez une image plus légère.';

type PreparedImage = { bytes: ArrayBuffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' };
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

// Partagé entre la fiche produit existante et le formulaire de création : sur un ordinateur, le
// navigateur n'a pas de mode « prendre une photo » — sans ce message, le bouton Photo semblait ne
// rien faire. Un navigateur de téléphone ou de tablette garde la vraie capture (détecté par son
// user-agent : un écran tactile ne suffit pas, beaucoup d'ordinateurs et de navigateurs automatisés
// en déclarent un).
export const cameraUnavailable = () => Platform.OS === 'web' && !(typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
export const CAMERA_NOTICE = 'L’appareil photo n’est pas disponible depuis un ordinateur. Utilisez « Galerie » pour choisir une image.';

// Type réel du fichier d'après ses premiers octets (jamais d'après son nom ni son type déclaré).
async function sniffImageType(blob: Blob): Promise<PreparedImage['contentType'] | null> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Redimensionne (1280 px max, sans agrandir) et compresse en JPEG avec createImageBitmap + canvas
// plutôt qu'avec expo-image-manipulator : celui-ci charge l'image via un élément <Image> dont
// l'échec rejette avec le <canvas> lui-même (« [object HTMLCanvasElement] », sans message).
async function optimizeOnWeb(source: Blob): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas indisponible');
  // Fond blanc : un PNG transparent deviendrait noir en JPEG.
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error('export du canvas impossible');
  return blob.arrayBuffer();
}

// L'optimisation est un confort, pas une condition : si le navigateur ne peut pas décoder ou
// redessiner l'image (canvas bloqué, format qu'il ne décode pas), on envoie le fichier d'origine
// tel quel — à condition que ses octets soient bien ceux d'un PNG, JPEG ou WebP, et qu'il tienne
// dans la limite du bucket.
async function prepareOnWeb(uri: string, file?: Blob): Promise<PreparedImage> {
  let source: Blob;
  try {
    source = file ?? await (await fetch(uri)).blob();
  } catch {
    throw new Error('Impossible de lire le fichier choisi. Réessayez.');
  }
  try {
    return { bytes: await optimizeOnWeb(source), contentType: 'image/jpeg', extension: 'jpg' };
  } catch (optimizeError) {
    console.warn('Optimisation de l’image impossible, envoi du fichier d’origine :', optimizeError);
    const contentType = await sniffImageType(source);
    if (!contentType) throw new Error(UNSUPPORTED);
    if (source.size > MAX_BYTES) throw new Error(TOO_HEAVY);
    return { bytes: await source.arrayBuffer(), contentType, extension: EXTENSIONS[contentType] };
  }
}

async function prepareOnDevice(uri: string, sourceWidth: number): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  if (sourceWidth > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  return { bytes: await (await fetch(optimized.uri)).arrayBuffer(), contentType: 'image/jpeg', extension: 'jpg' };
}

export type PickedImage = { uri: string; width: number; file?: Blob };

// Exporté : un produit pas encore enregistré n'a pas encore d'identifiant (le chemin de
// stockage en a besoin), donc la sélection doit pouvoir se faire à part de l'envoi — voir
// uploadPreparedImage, appelé une fois le produit créé.
export async function pickProductImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
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

/** Optimise puis envoie une image déjà sélectionnée (voir pickProductImage) pour un produit qui a désormais un identifiant. */
export async function uploadPreparedImage(picked: PickedImage, companyId: string, storeId: string, productId: string) {
  let image: PreparedImage;
  try {
    image = Platform.OS === 'web' ? await prepareOnWeb(picked.uri, picked.file) : await prepareOnDevice(picked.uri, picked.width);
  } catch (error) {
    // Toujours une vraie erreur avec un message : le composant l'affiche à l'utilisateur.
    throw error instanceof Error ? error : new Error('Cette image ne peut pas être lue. Choisissez un fichier PNG, JPEG ou WebP valide.');
  }
  const path = `${companyId}/${storeId}/${productId}/${Crypto.randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, image.bytes, { contentType: image.contentType, upsert: false });
  if (error) throw new Error(error.message);
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/authenticated/${bucket}/${path}`;
}

/** Sélectionne puis envoie en un seul appel, pour une fiche déjà enregistrée (voir ProductImagesCard). */
export async function uploadProductImage(source: 'camera' | 'library', companyId: string, storeId: string, productId: string) {
  const picked = await pickProductImage(source);
  if (!picked) return null;
  return uploadPreparedImage(picked, companyId, storeId, productId);
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
