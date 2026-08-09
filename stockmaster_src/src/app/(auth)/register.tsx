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
          emailRedirectTo: Linking.createURL('/'),
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
          setError(
            'Supabase ne peut pas envoyer l’email de confirmation. Vérifiez les paramètres SMTP.',
          );
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
        router.replace('/');
        return;
      }

      setCreatedEmail(normalizedEmail);
      setMessage('Compte créé. Confirmez maintenant votre adresse email.');
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
              Un lien a été envoyé à {createdEmail}. Confirmez votre adresse, puis revenez
              dans StockMaster pour continuer la création de votre entreprise. Les
              informations saisies seront déjà remplies.
            </Text>
          </Card.Content>
        </Card>
        <AppButton onPress={() => router.replace('/(auth)/login')}>
          J’ai confirmé mon email — Continuer
        </AppButton>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Créer votre compte" subtitle="Démarrez votre essai StockMaster.">
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
