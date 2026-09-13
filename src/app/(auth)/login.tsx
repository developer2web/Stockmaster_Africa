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

export default function LoginScreen() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [mode,setMode]=useState<'choice'|'admin'>('choice');
  const [error,setError]=useState('');
  const { refreshMembership } = useAuth();
  const {control,handleSubmit,formState:{isSubmitting}}=useForm<LoginInput>({resolver:zodResolver(loginSchema),defaultValues:{email:'',password:''}});
  const submit=handleSubmit(async values=>{setError('');const result=await signInForPortal(values.email,values.password,'admin');if(!result.ok)return setError(result.message??'Connexion impossible.');if(result.mfaRequired){router.replace({pathname:'/(auth)/mfa',params:{portal:'admin'}});return;}await refreshMembership();router.replace('/')});

  if(mode==='choice')return <AuthScreen title="Choisir votre espace" subtitle="Connectez-vous selon votre rôle.">
    {!!notice && <HelperText type="info" visible>{String(notice)}</HelperText>}
    <Card mode="outlined" onPress={()=>setMode('admin')} accessibilityLabel="Administrateur"><Card.Content style={{flexDirection:'row',alignItems:'center',gap:10}}><Icon source="shield-account" size={36}/><View style={{flexGrow:1,minWidth:0}}><Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit>Administrateur</Text><Text numberOfLines={1} adjustsFontSizeToFit>Entreprise, boutiques et équipe</Text></View></Card.Content></Card>
    <Card mode="outlined" onPress={()=>router.push('/employee' as never)} accessibilityLabel="Employé"><Card.Content style={{flexDirection:'row',alignItems:'center',gap:10}}><Icon source="account-hard-hat" size={36}/><View style={{flexGrow:1,minWidth:0}}><Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit>Employé</Text><Text numberOfLines={1} adjustsFontSizeToFit>Accès fourni par l’administrateur</Text></View></Card.Content></Card>
    <View style={{gap:12,alignItems:'center',marginTop:6}}>
      <Link href="/(auth)/register" asChild><Text style={{textAlign:'center',fontWeight:'700'}}>Créer une nouvelle entreprise</Text></Link>
      <AppButton mode="outlined" icon="play-circle-outline" onPress={() => router.push('/demo' as never)}>Découvrir en mode démo</AppButton>
    </View>
  </AuthScreen>;

  return <AuthScreen title="Connexion administrateur" subtitle="Accédez à la gestion StockMaster.">
    {!!notice && <HelperText type="info" visible>{String(notice)}</HelperText>}
    <FormField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address"/>
    <FormField control={control} name="password" label="Mot de passe" passwordToggle/>
    {!!error&&<HelperText type="error" visible>{error}</HelperText>}
    <AppButton onPress={submit} loading={isSubmitting} disabled={isSubmitting}>Se connecter</AppButton>
    <AppButton mode="text" onPress={()=>setMode('choice')}>Changer d’espace</AppButton>
    <Link href="/(auth)/forgot-password" asChild><Text style={{textAlign:'center'}}>Mot de passe oublié ?</Text></Link>
  </AuthScreen>;
}
