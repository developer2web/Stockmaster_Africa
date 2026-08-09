import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { FormField } from '@/components/forms/FormField';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';
import { SelectField } from '@/components/forms/SelectField';
import { supportedCountries } from '@/constants/countries';
import { getAccessibleBusinesses } from '@/features/workspace/api';

export default function CompleteProfile() {
  const { session, membership, businesses, stores, needsOnboarding, isLoading, isWorkspaceLoading, refreshMembership, signOut } = useAuth();
  const meta = session?.user.user_metadata;
  const [error, setError] = useState('');
  const { control, handleSubmit, formState } = useForm<{ companyName: string; storeName: string; countryCode: string }>({ defaultValues: { companyName: meta?.company_name ?? '', storeName: meta?.store_name ?? '', countryCode: meta?.country_code ?? 'GN' } });
  const submit = handleSubmit(async (v) => {
    setError('');
    try {
      const existingBusinesses = await getAccessibleBusinesses();
      if (!existingBusinesses.length) {
        const { error: creationError } = await supabase.rpc('bootstrap_company', {
          p_company_name: v.companyName,
          p_store_name: v.storeName,
          p_country_code: v.countryCode,
        });
        if (creationError) throw creationError;
      }
      await refreshMembership();
      router.replace('/');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Impossible de créer votre entreprise. Réessayez.');
    }
  });
  if (isLoading || isWorkspaceLoading) return <LoadingScreen label="Recherche de votre entreprise…" />;
  if (membership) return <Redirect href="/" />;
  if (!needsOnboarding) return <Redirect href="/" />;
  const employeeOnly = businesses.length > 0 && businesses.every((business) => business.role === 'employee');
  if (employeeOnly) return <Redirect href={stores.length > 1 ? '/choose-store' : '/'} />;
  const returnHome = async () => { await signOut(); router.replace('/(auth)/login'); };
  return <AuthScreen title="Finaliser l’entreprise" subtitle="Une dernière étape avant votre tableau de bord."><FormField control={control} name="companyName" label="Entreprise" /><FormField control={control} name="storeName" label="Première boutique" /><Controller control={control} name="countryCode" render={({field})=><SelectField label="Pays d’activité" value={field.value} onChange={(value)=>field.onChange(value??'GN')} options={supportedCountries.map((country)=>({label:`${country.name} — ${country.currency}`,value:country.code}))}/>} />{!!error && <HelperText type="error" visible>{error}</HelperText>}<AppButton onPress={submit} loading={formState.isSubmitting}>Créer mon espace</AppButton><AppButton mode="text" icon="arrow-left" onPress={returnHome}>Retour à la page d’accueil</AppButton></AuthScreen>;
}
