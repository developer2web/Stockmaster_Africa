import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect,useState } from 'react';
import { HelperText,TextInput } from 'react-native-paper';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { AppButton } from '@/components/ui/AppButton';
import { supabase } from '@/services/supabase/client';

export default function MfaChallenge(){const[code,setCode]=useState('');const[factorId,setFactorId]=useState('');const[loadError,setLoadError]=useState('');useEffect(()=>{void supabase.auth.mfa.listFactors().then(({data,error})=>{if(error)setLoadError(error.message);else setFactorId(data.totp.find(f=>f.status==='verified')?.id??'')})},[]);const verify=useMutation({mutationFn:async()=>{if(!factorId)throw new Error('Aucun facteur 2FA vérifié.');const{error}=await supabase.auth.mfa.challengeAndVerify({factorId,code:code.trim()});if(error)throw new Error(error.message)},onSuccess:()=>router.replace('/')});return <AuthScreen title="Vérification en deux étapes" subtitle="Confirmez votre identité pour continuer."><TextInput mode="outlined" label="Code à 6 chiffres" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6}/>{!!(loadError||verify.error)&&<HelperText type="error" visible>{loadError||verify.error?.message}</HelperText>}<AppButton icon="shield-check" loading={verify.isPending} disabled={!factorId||code.trim().length!==6||verify.isPending} onPress={()=>verify.mutate()}>Vérifier</AppButton></AuthScreen>}
