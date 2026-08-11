import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase/client';

export async function uploadPaymentProof(companyId: string) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorisez l’accès aux photos pour joindre la preuve.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled) return null;
  const context = ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 1400 });
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ compress: 0.78, format: SaveFormat.JPEG });
  const bytes = await (await fetch(optimized.uri)).arrayBuffer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Session expirée.');
  const path = `${user.user.id}/${companyId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function getPaymentProofUrl(path: string) {
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
