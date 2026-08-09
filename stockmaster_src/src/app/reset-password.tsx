import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { resetPasswordSchema } from '@/schemas/auth';
import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { z } from 'zod';

type ResetInput=z.infer<typeof resetPasswordSchema>;
export default function ResetPassword(){
  const[error,setError]=useState('');
  const{control,handleSubmit,formState}=useForm<ResetInput>({resolver:zodResolver(resetPasswordSchema),defaultValues:{password:''}});
  const submit=handleSubmit(async({password})=>{
    setError('');
    const{error:updateError}=await supabase.auth.updateUser({password});
    if(updateError)return setError(userErrorMessage(updateError));
    router.replace('/');
  });
  return <AuthScreen title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sécurisé.">
    <FormField control={control} name="password" label="Nouveau mot de passe" passwordToggle/>
    {!!error&&<HelperText type="error" visible>{error}</HelperText>}
    <AppButton onPress={submit} loading={formState.isSubmitting} disabled={formState.isSubmitting}>Mettre à jour</AppButton>
  </AuthScreen>;
}
