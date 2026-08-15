import NetInfo from '@react-native-community/netinfo';

export async function isDeviceOffline() {
  const state = await NetInfo.fetch();
  return state.isConnected === false || state.isInternetReachable === false;
}
