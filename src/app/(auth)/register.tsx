import { zodResolver } from '@hookform/resolvers/zod';
import * as Linking from 'expo-linking';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Card, HelperText, Icon, Text } from 'react-native-paper';

import { SelectField } from '@/components/forms/SelectField';
import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { supportedCountries } from '@/constants/countries';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { registerSchema, type RegisterInput } from '@/schemas/auth';
import { supabase } from '@/services/supabase/client';

export default function RegisterScreen() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [resending,setResending]=useState(false);
  const [resendMessage,setResendMessage]=useState('');
  const submissionLocked = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      companyName: '',
      storeName: '',
      countryCode: 'GN',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const submit = handleSubmit(async ({ confirmPassword: _, ...values }) => {
    if (submissionLocked.current) return;
    submissionLocked.current = true;
    setError('');
    setMessage('');

    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: values.password,
        options: {
          emailRedirectTo: Linking.createURL('/(auth)/complete-profile'),
          data: {
            full_name: values.fullName,
            company_name: values.companyName,
            store_name: values.storeName,
            country_code: values.countryCode,
          },
        },
      });

      if (authError) {
        if (authError.status === 500 || /sending confirmation email/i.test(authError.message)) {
          setCreatedEmail(normalizedEmail);
          setMessage('Le compte a été enregistré, mais le premier email n’a pas pu être envoyé.');
          setError('Utilisez « Renvoyer l’email ». Si l’erreur continue, la configuration SMTP Supabase doit être corrigée.');
          return;
        }
        if (
          authError.status === 429 ||
          /security purposes|after \d+ seconds/i.test(authError.message)
        ) {
          setError(
            'Une demande a déjà été envoyée. Consultez votre boîte email et attendez environ une minute avant de réessayer.',
          );
          return;
        }
        setError(authError.message || 'Création du compte impossible.');
        return;
      }

      if(data.user?.identities?.length===0){setError('Cette adresse email possède déjà un compte StockMaster. Connectez-vous avec ce compte. Si vous êtes employé et souhaitez devenir administrateur, faites la demande depuis Paramètres > Devenir administrateur.');return}

      if (data.session) {
        const { error: setupError } = await supabase.rpc('bootstrap_company', {
          p_company_name: values.companyName,
          p_store_name: values.storeName,
          p_country_code: values.countryCode,
        });
        if (setupError) {
          setError(setupError.message || 'Impossible de créer l’entreprise.');
          return;
        }
        router.replace('/(subscription)/welcome');
        return;
      }

      setCreatedEmail(normalizedEmail);
      setMessage('Nous venons d’envoyer un email de confirmation dans votre boîte de réception.');
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : 'Erreur réseau pendant la création du compte.',
      );
    } finally {
      submissionLocked.current = false;
    }
  });

  if (createdEmail) {
    const resend=async()=>{setResending(true);setError('');setResendMessage('');const{error:resendError}=await supabase.auth.resend({type:'signup',email:createdEmail,options:{emailRedirectTo:Linking.createURL('/(auth)/complete-profile')}});setResending(false);if(resendError){setError(/security purposes|after \d+ seconds/i.test(resendError.message)?'Veuillez attendre environ une minute avant de demander un nouvel envoi.':'L’email n’a pas pu être renvoyé. Vérifiez l’adresse et la configuration SMTP.');return}setResendMessage('Un nouvel email vient d’être envoyé. Vérifiez aussi le dossier Courrier indésirable.')};
    return (
      <AuthScreen
        title="Vérifiez votre email"
        subtitle="Votre compte StockMaster a bien été enregistré."
      >
        <Card mode="contained">
          <Card.Content style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
            <Icon source="email-check-outline" size={48} />
            <Text variant="titleMedium" style={{ textAlign: 'center' }}>
              {message}
            </Text>
            <Text style={{ textAlign: 'center' }}>
              Ouvrez l’email envoyé à {createdEmail}, puis cliquez sur « Confirmer mon adresse email ».
              Après la confirmation, StockMaster vous conduira directement au choix entre l’essai gratuit de 14 jours et un abonnement.
            </Text>
            <Text style={{textAlign:'center'}}>Vous ne trouvez pas le message ? Vérifiez les dossiers Spam, Indésirables et Promotions.</Text>
          </Card.Content>
        </Card>
        {!!resendMessage&&<HelperText type="info" visible>{resendMessage}</HelperText>}
        {!!error&&<HelperText type="error" visible>{error}</HelperText>}
        <AppButton icon="email-sync-outline" mode="outlined" loading={resending} disabled={resending} onPress={resend}>Renvoyer l’email de confirmation</AppButton>
        <AppButton onPress={() => router.replace('/(auth)/login')}>J’ai confirmé mon email — Me connecter</AppButton>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Créer votre compte" subtitle="Votre adresse email devra être confirmée avant l’accès.">
      <Card mode="contained"><Card.Content style={{gap:6}}><Text variant="titleMedium">Confirmation par email</Text><Text>Après votre inscription, nous allons envoyer un email dans votre boîte de réception. Vous devrez cliquer sur le lien de confirmation avant de choisir votre essai gratuit ou votre abonnement.</Text></Card.Content></Card>
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      <FormField control={control} name="fullName" label="Nom complet" />
      <FormField control={control} name="companyName" label="Entreprise" />
      <FormField control={control} name="storeName" label="Première boutique" />
      <Controller
        control={control}
        name="countryCode"
        render={({ field, fieldState }) => (
          <SelectField
            label="Pays d’activité"
            value={field.value}
            onChange={(value) => field.onChange(value ?? 'GN')}
            error={fieldState.error?.message}
            options={supportedCountries.map((country) => ({
              label: `${country.name} — ${country.currency}`,
              value: country.code,
            }))}
          />
        )}
      />
      <FormField
        control={control}
        name="email"
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField control={control} name="password" label="Mot de passe" passwordToggle />
      <FormField
        control={control}
        name="confirmPassword"
        label="Confirmer le mot de passe"
        passwordToggle
      />
      <AppButton onPress={submit} loading={isSubmitting} disabled={isSubmitting}>
        S’inscrire
      </AppButton>
      <Text variant="bodySmall" style={{ textAlign: 'center' }}>
        En vous inscrivant, vous acceptez nos{' '}
        <Link href="/legal/terms">conditions d’utilisation</Link>
        {' '}et notre{' '}
        <Link href="/legal/privacy">politique de confidentialité</Link>.
      </Text>
      <Link href="/(auth)/login" asChild>
        <Text style={{ textAlign: 'center' }}>J’ai déjà un compte</Text>
      </Link>
    </AuthScreen>
  );
}
