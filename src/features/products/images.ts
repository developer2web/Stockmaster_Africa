import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase/client';

const bucket = 'product-images';

async function pick(source: 'camera' | 'library') {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(source === 'camera' ? 'Autorisez l’accès à la caméra.' : 'Autorisez l’accès à vos photos.');
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  return result.canceled ? null : result.assets[0].uri;
}

function storagePath(url: string) {
  const marker = `/storage/v1/object/authenticated/${bucket}/`;
  const index = url.indexOf(marker);
  return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export async function uploadProductImage(source: 'camera' | 'library', companyId: string, storeId: string, productId: string) {
  const uri = await pick(source);
  if (!uri) return null;
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1280 });
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  const bytes = await (await fetch(optimized.uri)).arrayBuffer();
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
