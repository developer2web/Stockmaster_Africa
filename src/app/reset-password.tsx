import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { resetPasswordSchema } from '@/schemas/auth';
import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { z } from 'zod';

type ResetInput=z.infer<typeof resetPasswordSchema>;

// Revue sécurité du 25/09 : un lien de réinitialisation expiré ou déjà
// utilisé n'établit aucune session (Supabase laisse l'URL avec des
// paramètres d'erreur, sans jamais notifier onAuthStateChange côté web).
// Avant ce correctif, l'écran affichait quand même le formulaire, qui
// échouait ensuite avec un message générique et sans possibilité évidente
// de redemander un lien. `getSession()` attend l'initialisation du client
// (donc la tentative de récupération de session depuis l'URL) avant de
// répondre : son résultat dit de façon fiable si le lien était valide.
export default function ResetPassword(){
  const[status,setStatus]=useState<'checking'|'ready'|'invalid'>('checking');
  const[error,setError]=useState('');
  const{control,handleSubmit,formState}=useForm<ResetInput>({resolver:zodResolver(resetPasswordSchema),defaultValues:{password:''}});

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{ if(alive) setStatus(data.session?'ready':'invalid'); });
    return ()=>{ alive=false; };
  },[]);

  const submit=handleSubmit(async({password})=>{
    setError('');
    const{error:updateError}=await supabase.auth.updateUser({password});
    if(updateError)return setError(userErrorMessage(updateError));
    router.replace('/');
  });

  if(status==='checking') return <AuthScreen title="Nouveau mot de passe" subtitle="Vérification du lien…">
    <Text>Vérification de votre lien de réinitialisation…</Text>
  </AuthScreen>;

  if(status==='invalid') return <AuthScreen title="Lien invalide" subtitle="Ce lien n’est plus utilisable.">
    <Text>Ce lien de réinitialisation est invalide, a expiré ou a déjà été utilisé. Demandez-en un nouveau pour continuer.</Text>
    <AppButton onPress={()=>router.replace('/(auth)/forgot-password')}>Demander un nouveau lien</AppButton>
  </AuthScreen>;

  return <AuthScreen title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sécurisé.">
    <FormField control={control} name="password" label="Nouveau mot de passe" passwordToggle autoComplete="new-password" textContentType="newPassword"/>
    {!!error&&<HelperText type="error" visible>{error}</HelperText>}
    <AppButton onPress={submit} loading={formState.isSubmitting} disabled={formState.isSubmitting}>Mettre à jour</AppButton>
  </AuthScreen>;
}
