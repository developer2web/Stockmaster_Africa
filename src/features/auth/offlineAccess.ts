import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getOfflineDeviceId } from '@/features/offline/device';
import type { BusinessAccess, MembershipContext, StoreAccess } from '@/types/database';

const PROFILE_KEY = 'stockmaster:offline-access-profile:v2';
const PROFILE_CONTEXT_KEY = 'stockmaster:offline-access-context:v3';
const LEGACY_ACCESS_PREFIX = 'stockmaster:verified-access:v1:';
export const OFFLINE_ACCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_PIN_LOCK_MS = 15 * 60 * 1000;
export const OFFLINE_PIN_MAX_ATTEMPTS = 5;

export type OfflineAccessProfile = {
  version: 2;
  offlineEnabled: true;
  userId: string;
  email: string;
  fullName: string;
  offlineId: string;
  companyId: string;
  storeId: string;
  deviceBindingId: string;
  membership: MembershipContext;
  businesses: BusinessAccess[];
  stores: StoreAccess[];
  pinSalt: string;
  pinVerifier: string;
  lastServerValidationAt: string;
  lastSynchronizedAt: string | null;
  failedAttempts: number;
  lockUntil: string | null;
};

export type OfflineAccessSummary = Pick<
  OfflineAccessProfile,
  'offlineId' | 'email' | 'fullName' | 'companyId' | 'storeId' | 'lastServerValidationAt' | 'lastSynchronizedAt' | 'failedAttempts' | 'lockUntil'
> & { expired: boolean };

export type OfflineUnlockResult =
  | { ok: true; profile: OfflineAccessProfile }
  | { ok: false; reason: 'unavailable' | 'expired' | 'locked' | 'invalid'; message: string; lockUntil?: string };

type EnableOfflineAccessInput = {
  userId: string;
  email: string;
  fullName: string;
  pin: string;
  offlineId?: string;
  membership: MembershipContext;
  businesses: BusinessAccess[];
  stores: StoreAccess[];
};

type RefreshOfflineAccessInput = Omit<EnableOfflineAccessInput, 'pin'>;
type OfflineProfileSecrets = Pick<OfflineAccessProfile,'deviceBindingId'|'pinSalt'|'pinVerifier'>;
type OfflineProfileContext = Omit<OfflineAccessProfile,keyof OfflineProfileSecrets>;
type OfflineProfileEnvelope = OfflineProfileSecrets & {version:3;contextDigest:string};

function isProfile(value: unknown): value is OfflineAccessProfile {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OfflineAccessProfile>;
  return row.version === 2
    && row.offlineEnabled === true
    && typeof row.userId === 'string'
    && typeof row.offlineId === 'string'
    && typeof row.companyId === 'string'
    && typeof row.storeId === 'string'
    && typeof row.deviceBindingId === 'string'
    && typeof row.pinSalt === 'string'
    && typeof row.pinVerifier === 'string'
    && typeof row.lastServerValidationAt === 'string'
    && !!row.membership
    && typeof row.membership === 'object'
    && Array.isArray(row.businesses)
    && Array.isArray(row.stores)
    && typeof row.failedAttempts === 'number';
}

function hasFreshValidation(profile: OfflineAccessProfile, now = Date.now()) {
  const verifiedAt = Date.parse(profile.lastServerValidationAt);
  return Number.isFinite(verifiedAt)
    && verifiedAt <= now + 5 * 60 * 1000
    && now - verifiedAt <= OFFLINE_ACCESS_MAX_AGE_MS;
}

function isEnvelope(value:unknown):value is OfflineProfileEnvelope{
  if(!value||typeof value!=='object')return false;
  const row=value as Partial<OfflineProfileEnvelope>;
  return row.version===3&&typeof row.deviceBindingId==='string'&&typeof row.pinSalt==='string'&&typeof row.pinVerifier==='string'&&typeof row.contextDigest==='string';
}

async function digest(value:string){return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value);}

function splitProfile(profile:OfflineAccessProfile){
  const {deviceBindingId,pinSalt,pinVerifier,...context}=profile;
  return {context,secrets:{deviceBindingId,pinSalt,pinVerifier}};
}

async function clearStoredProfile(){
  await Promise.allSettled([SecureStore.deleteItemAsync(PROFILE_KEY),AsyncStorage.removeItem(PROFILE_CONTEXT_KEY)]);
}

async function readProfile(): Promise<OfflineAccessProfile | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if(isProfile(parsed)){
      // Migration transparente de l'ancien enregistrement monolithique.
      await saveProfile(parsed).catch(()=>undefined);
      return parsed;
    }
    if(!isEnvelope(parsed)){await clearStoredProfile();return null;}
    const contextRaw=await AsyncStorage.getItem(PROFILE_CONTEXT_KEY);
    if(!contextRaw||await digest(contextRaw)!==parsed.contextDigest){await clearStoredProfile();return null;}
    const context=JSON.parse(contextRaw) as OfflineProfileContext;
    const profile={...context,deviceBindingId:parsed.deviceBindingId,pinSalt:parsed.pinSalt,pinVerifier:parsed.pinVerifier};
    if(!isProfile(profile)){await clearStoredProfile();return null;}
    return profile;
  } catch {
    return null;
  }
}

async function saveProfile(profile: OfflineAccessProfile) {
  if (Platform.OS === 'web') throw new Error('L’accès hors ligne sécurisé est disponible uniquement sur mobile.');
  const {context,secrets}=splitProfile(profile);
  const contextRaw=JSON.stringify(context);
  const envelope:OfflineProfileEnvelope={version:3,...secrets,contextDigest:await digest(contextRaw)};
  const previousContext=await AsyncStorage.getItem(PROFILE_CONTEXT_KEY);
  try{
    await AsyncStorage.setItem(PROFILE_CONTEXT_KEY,contextRaw);
    await SecureStore.setItemAsync(PROFILE_KEY,JSON.stringify(envelope));
  }catch{
    if(previousContext===null)await AsyncStorage.removeItem(PROFILE_CONTEXT_KEY).catch(()=>undefined);
    else await AsyncStorage.setItem(PROFILE_CONTEXT_KEY,previousContext).catch(()=>undefined);
    throw new Error('Impossible d’enregistrer le PIN sur cet appareil. Vérifiez le verrouillage sécurisé du téléphone puis réessayez.');
  }
}

async function clearLegacyAccessSnapshots() {
  const keys = await AsyncStorage.getAllKeys();
  const legacyKeys = keys.filter((key) => key.startsWith(LEGACY_ACCESS_PREFIX));
  if (legacyKeys.length) await AsyncStorage.multiRemove(legacyKeys);
}

async function createPinVerifier(pin: string, salt: string, deviceBindingId: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${deviceBindingId}:${pin}`,
  );
}

async function generateOfflineId() {
  const bytes = await Crypto.getRandomBytesAsync(4);
  const value = (((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) % 90_000;
  return `SM-${String(value + 10_000).padStart(5, '0')}`;
}

export async function prepareOfflineAccessId(userId: string) {
  if (Platform.OS === 'web') throw new Error('L’accès hors ligne sécurisé est disponible uniquement sur mobile.');
  const existing = await readProfile();
  return existing?.userId === userId ? existing.offlineId : generateOfflineId();
}

export function validateOfflinePin(pin: string) {
  if (!/^\d{6}$/.test(pin)) return 'Le PIN doit contenir exactement 6 chiffres.';
  if (/^(\d)\1{5}$/.test(pin)) return 'Choisissez un PIN moins facile à deviner.';
  if (['123456', '654321', '012345', '543210'].includes(pin)) return 'Choisissez un PIN moins facile à deviner.';
  return null;
}

export async function enableOfflineAccess(input: EnableOfflineAccessInput): Promise<OfflineAccessProfile> {
  const pinError = validateOfflinePin(input.pin);
  if (pinError) throw new Error(pinError);
  if (!input.membership.companyId || !input.membership.storeId) throw new Error('Sélectionnez une entreprise et une boutique avant l’activation.');
  if (input.membership.role === 'super_admin') throw new Error('Le Super Administrateur ne peut pas utiliser le mode hors ligne.');
  if (input.membership.role === 'employee' && !input.membership.permissions.includes('sales.write')) {
    throw new Error('L’autorisation de créer des ventes est obligatoire pour l’accès hors ligne.');
  }

  const deviceBindingId = await getOfflineDeviceId();
  const existing = await readProfile();
  const requestedId = input.offlineId?.trim().toUpperCase();
  const offlineId = /^SM-\d{5}$/.test(requestedId ?? '')
    ? requestedId!
    : existing?.userId === input.userId
      ? existing.offlineId
      : await generateOfflineId();
  const pinSalt = Crypto.randomUUID();
  const now = new Date().toISOString();
  const profile: OfflineAccessProfile = {
    version: 2,
    offlineEnabled: true,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    offlineId,
    companyId: input.membership.companyId,
    storeId: input.membership.storeId,
    deviceBindingId,
    membership: input.membership,
    businesses: input.businesses.filter((business) => business.companyId === input.membership.companyId),
    stores: input.stores.filter((store) => store.storeId === input.membership.storeId),
    pinSalt,
    pinVerifier: await createPinVerifier(input.pin, pinSalt, deviceBindingId),
    lastServerValidationAt: now,
    lastSynchronizedAt: existing?.userId === input.userId ? existing.lastSynchronizedAt : null,
    failedAttempts: 0,
    lockUntil: null,
  };
  await saveProfile(profile);
  await clearLegacyAccessSnapshots().catch(() => undefined);
  return profile;
}

export async function refreshOfflineAccessIfEnabled(input: RefreshOfflineAccessInput) {
  const profile = await readProfile();
  if (!profile || profile.userId !== input.userId || profile.membership.role === 'super_admin') return null;
  if (input.membership.role === 'employee' && !input.membership.permissions.includes('sales.write')) {
    await disableOfflineAccess();
    return null;
  }
  const deviceBindingId = await getOfflineDeviceId();
  if (profile.deviceBindingId !== deviceBindingId || !input.membership.companyId || !input.membership.storeId) return null;

  const refreshed: OfflineAccessProfile = {
    ...profile,
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    companyId: input.membership.companyId,
    storeId: input.membership.storeId,
    membership: input.membership,
    businesses: input.businesses.filter((business) => business.companyId === input.membership.companyId),
    stores: input.stores.filter((store) => store.storeId === input.membership.storeId),
    lastServerValidationAt: new Date().toISOString(),
  };
  await saveProfile(refreshed);
  return refreshed;
}

export async function loadOfflineAccessProfile(userId?: string, now = Date.now()) {
  const profile = await readProfile();
  if (!profile || (userId && profile.userId !== userId)) return null;
  if (profile.membership.role === 'super_admin' || !profile.companyId || !profile.storeId) return null;
  if (profile.membership.role === 'employee' && !profile.membership.permissions.includes('sales.write')) return null;
  if (profile.deviceBindingId !== await getOfflineDeviceId()) return null;
  return { profile, expired: !hasFreshValidation(profile, now) };
}

export async function getOfflineAccessSummary(now = Date.now()): Promise<OfflineAccessSummary | null> {
  const result = await loadOfflineAccessProfile(undefined, now);
  if (!result) return null;
  const { profile, expired } = result;
  return {
    offlineId: profile.offlineId,
    email: profile.email,
    fullName: profile.fullName,
    companyId: profile.companyId,
    storeId: profile.storeId,
    lastServerValidationAt: profile.lastServerValidationAt,
    lastSynchronizedAt: profile.lastSynchronizedAt,
    failedAttempts: profile.failedAttempts,
    lockUntil: profile.lockUntil,
    expired,
  };
}

export async function unlockOfflineAccess(offlineId: string, pin: string, now = Date.now()): Promise<OfflineUnlockResult> {
  const loaded = await loadOfflineAccessProfile(undefined, now);
  if (!loaded) return { ok: false, reason: 'unavailable', message: 'Aucun accès hors ligne autorisé sur cet appareil.' };
  const { profile, expired } = loaded;
  if (expired) return { ok: false, reason: 'expired', message: 'L’accès hors ligne a expiré. Reconnectez cet appareil à Internet.' };

  const lockUntil = profile.lockUntil ? Date.parse(profile.lockUntil) : Number.NaN;
  if (Number.isFinite(lockUntil) && lockUntil > now) {
    return { ok: false, reason: 'locked', message: 'Trop de tentatives. Réessayez après le verrouillage temporaire.', lockUntil: profile.lockUntil ?? undefined };
  }

  const normalizedId = offlineId.trim().toUpperCase();
  const verifier = await createPinVerifier(pin, profile.pinSalt, profile.deviceBindingId);
  if (normalizedId !== profile.offlineId || verifier !== profile.pinVerifier) {
    const previousAttempts = Number.isFinite(lockUntil) && lockUntil <= now ? 0 : profile.failedAttempts;
    const failedAttempts = previousAttempts + 1;
    const shouldLock = failedAttempts >= OFFLINE_PIN_MAX_ATTEMPTS;
    const updated: OfflineAccessProfile = {
      ...profile,
      failedAttempts: shouldLock ? OFFLINE_PIN_MAX_ATTEMPTS : failedAttempts,
      lockUntil: shouldLock ? new Date(now + OFFLINE_PIN_LOCK_MS).toISOString() : null,
    };
    await saveProfile(updated);
    return {
      ok: false,
      reason: shouldLock ? 'locked' : 'invalid',
      message: shouldLock
        ? 'Accès verrouillé pendant 15 minutes après cinq tentatives incorrectes.'
        : `ID ou PIN incorrect. ${OFFLINE_PIN_MAX_ATTEMPTS - failedAttempts} tentative(s) restante(s).`,
      lockUntil: updated.lockUntil ?? undefined,
    };
  }

  const unlocked = { ...profile, failedAttempts: 0, lockUntil: null };
  await saveProfile(unlocked);
  return { ok: true, profile: unlocked };
}

export async function markOfflineAccessSynchronized(at = new Date().toISOString()) {
  const profile = await readProfile();
  if (!profile) return;
  await saveProfile({ ...profile, lastSynchronizedAt: at });
}

export async function disableOfflineAccess() {
  if (Platform.OS === 'web') return;
  await Promise.allSettled([
    SecureStore.deleteItemAsync(PROFILE_KEY),
    AsyncStorage.removeItem(PROFILE_CONTEXT_KEY),
    clearLegacyAccessSnapshots(),
  ]);
}

export const clearOfflineAccessSnapshot = disableOfflineAccess;
