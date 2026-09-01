import { AccessibilityInfo, Platform, Vibration } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

type ScanFeedbackKind = 'success' | 'error';
const players:Partial<Record<ScanFeedbackKind,AudioPlayer>>={};

function setUint32(bytes:Uint8Array,offset:number,value:number){bytes[offset]=value&255;bytes[offset+1]=(value>>8)&255;bytes[offset+2]=(value>>16)&255;bytes[offset+3]=(value>>24)&255;}
function setUint16(bytes:Uint8Array,offset:number,value:number){bytes[offset]=value&255;bytes[offset+1]=(value>>8)&255;}
function bytesToBase64(bytes:Uint8Array){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let result='';for(let index=0;index<bytes.length;index+=3){const first=bytes[index],second=index+1<bytes.length?bytes[index+1]:0,third=index+2<bytes.length?bytes[index+2]:0;const value=(first<<16)|(second<<8)|third;result+=chars[(value>>18)&63]+chars[(value>>12)&63]+(index+1<bytes.length?chars[(value>>6)&63]:'=')+(index+2<bytes.length?chars[value&63]:'=');}return result;}
function toneWav(frequency:number){const sampleRate=8000,samples=720,bytes=new Uint8Array(44+samples);'RIFF'.split('').forEach((value,index)=>bytes[index]=value.charCodeAt(0));setUint32(bytes,4,36+samples);'WAVEfmt '.split('').forEach((value,index)=>bytes[8+index]=value.charCodeAt(0));setUint32(bytes,16,16);setUint16(bytes,20,1);setUint16(bytes,22,1);setUint32(bytes,24,sampleRate);setUint32(bytes,28,sampleRate);setUint16(bytes,32,1);setUint16(bytes,34,8);'data'.split('').forEach((value,index)=>bytes[36+index]=value.charCodeAt(0));setUint32(bytes,40,samples);for(let index=0;index<samples;index++){const fade=1-index/samples;bytes[44+index]=Math.round(128+45*fade*Math.sin(2*Math.PI*frequency*index/sampleRate));}return bytesToBase64(bytes);}

async function playNativeTone(kind:ScanFeedbackKind){
  if(Platform.OS==='web'||!FileSystem.cacheDirectory)return;
  try{
    let player=players[kind];
    if(!player){
      const uri=`${FileSystem.cacheDirectory}stockmaster-scan-${kind}.wav`;
      await FileSystem.writeAsStringAsync(uri,toneWav(kind==='success'?1046:220),{encoding:FileSystem.EncodingType.Base64});
      player=createAudioPlayer(uri);players[kind]=player;
    }
    await player.seekTo(0);player.play();
  }catch{/* La vibration reste disponible si le son système est refusé. */}
}

function playWebTone(kind: ScanFeedbackKind) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.AudioContext) return;
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'success' ? 880 : 220;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Le navigateur peut refuser le son automatique. La vibration et l'annonce restent actives.
  }
}

export function emitScanFeedback(kind: ScanFeedbackKind, announcement: string) {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(kind === 'success' ? 45 : [0, 70, 70, 90]);
    void playNativeTone(kind);
  }
  playWebTone(kind);
  void AccessibilityInfo.announceForAccessibility(announcement);
}
