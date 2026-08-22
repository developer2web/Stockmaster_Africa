import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_KEY='stockmaster:offline-device-id:v1';

export async function getOfflineDeviceId(){
  const current=Platform.OS==='web'?await AsyncStorage.getItem(DEVICE_KEY):await SecureStore.getItemAsync(DEVICE_KEY);
  if(current)return current;
  const id=Crypto.randomUUID();
  if(Platform.OS==='web')await AsyncStorage.setItem(DEVICE_KEY,id);else await SecureStore.setItemAsync(DEVICE_KEY,id);
  return id;
}

export async function createOfflineMetadata(){return{deviceId:await getOfflineDeviceId(),createdAt:new Date().toISOString()}}
