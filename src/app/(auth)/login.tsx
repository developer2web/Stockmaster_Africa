import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, HelperText, Icon, Text } from 'react-native-paper';
import { View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { signInForPortal } from '@/features/auth/portalLogin';
import { loginSchema, LoginInput } from '@/schemas/auth';
import { resolveNotice } from '@/constants/notices';

export default function LoginScreen() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const noticeText = resolveNotice(notice);
  const [mode,setMode]=useState<'choice'|'admin'>('choice');
  const [error,setError]=useState('');
  const { refreshMembership } = useAuth();
  const {control,handleSubmit,formState:{isSubmitting}}=useForm<LoginInput>({resolver:zodResolver(loginSchema),defaultValues:{email:'',password:''}});
  const submit=handleSubmit(async values=>{setError('');const result=await signInForPortal(values.email,values.password,'admin');if(!result.ok)return setError(result.message??'Connexion impossible.');if(result.mfaRequired){router.replace({pathname:'/(auth)/mfa',params:{portal:'admin'}});return;}await refreshMembership();router.replace('/')});

  if(mode==='choice')return <AuthScreen title="Choisir votre espace" subtitle="Connectez-vous selon votre rôle.">
    {!!noticeText && <HelperText type="info" visible>{noticeText}</HelperText>}
    {/* adjustsFontSizeToFit n'a aucun effet sur le web ; retiré (libellés fixes
        courts, numberOfLines suffit comme filet de sécurité). */}
    <Card mode="outlined" onPress={()=>setMode('admin')} accessibilityLabel="Administrateur"><Card.Content style={{flexDirection:'row',alignItems:'center',gap:10}}><Icon source="shield-account" size={36}/><View style={{flexGrow:1,minWidth:0}}><Text variant="titleLarge" numberOfLines={1}>Administrateur</Text><Text numberOfLines={1}>Entreprise, boutiques et équipe</Text></View></Card.Content></Card>
    <Card mode="outlined" onPress={()=>router.push('/employee' as never)} accessibilityLabel="Employé"><Card.Content style={{flexDirection:'row',alignItems:'center',gap:10}}><Icon source="account-hard-hat" size={36}/><View style={{flexGrow:1,minWidth:0}}><Text variant="titleLarge" numberOfLines={1}>Employé</Text><Text numberOfLines={1}>Accès fourni par l’administrateur</Text></View></Card.Content></Card>
    <View style={{gap:12,alignItems:'center',marginTop:6}}>
      <Link href="/(auth)/register" asChild><Text style={{textAlign:'center',fontWeight:'700'}}>Créer une nouvelle entreprise</Text></Link>
      <AppButton mode="outlined" icon="play-circle-outline" onPress={() => router.push('/demo' as never)}>Découvrir en mode démo</AppButton>
    </View>
  </AuthScreen>;

  return <AuthScreen title="Connexion administrateur" subtitle="Accédez à la gestion StockMaster.">
    {!!noticeText && <HelperText type="info" visible>{noticeText}</HelperText>}
    <FormField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="username" textContentType="username"/>
    <FormField control={control} name="password" label="Mot de passe" passwordToggle autoComplete="current-password" textContentType="password"/>
    {!!error&&<HelperText type="error" visible>{error}</HelperText>}
    <AppButton onPress={submit} loading={isSubmitting} disabled={isSubmitting}>Se connecter</AppButton>
    <AppButton mode="text" onPress={()=>setMode('choice')}>Changer d’espace</AppButton>
    <Link href="/(auth)/forgot-password" asChild><Text style={{textAlign:'center'}}>Mot de passe oublié ?</Text></Link>
  </AuthScreen>;
}
