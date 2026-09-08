import { zodResolver } from '@hookform/resolvers/zod';
import * as Linking from 'expo-linking';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { Card, Checkbox, HelperText, Icon, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { registerSchema, type RegisterInput } from '@/schemas/auth';
import { supabase } from '@/services/supabase/client';

export default function RegisterScreen() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [resending,setResending]=useState(false);
  const [resendMessage,setResendMessage]=useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const submissionLocked = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const submit = handleSubmit(async ({ confirmPassword: _, ...values }) => {
    if (!acceptedLegal) {
      setError('Vous devez accepter les conditions d’utilisation et confirmer avoir lu la politique de confidentialité.');
      return;
    }
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

      if(data.user?.identities?.length===0){setError('Cette adresse email possède déjà un compte StockMaster. Connectez-vous avec ce compte. Une adresse email ne peut être utilisée qu’une seule fois.');return}

      if (data.session) {
        router.replace('/(auth)/complete-profile');
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
              Après la confirmation, StockMaster vous présentera les abonnements et les conditions d’essai disponibles pour votre compte.
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
    <AuthScreen title="Créer votre compte" subtitle="Étape 1 sur 2 · Votre adresse email devra être confirmée.">
      <Card mode="contained" style={{ backgroundColor: '#E1F1F2' }}><Card.Content style={{ gap: 6 }}><Text variant="titleMedium" style={{ fontWeight: '800', color: '#084B50' }}>Commencez simplement</Text><Text>Renseignez les champs marqués * . Après confirmation de votre email, vous ajouterez votre entreprise et votre boutique.</Text></Card.Content></Card>
      <Card mode="outlined"><Card.Content style={{gap:6}}><Text variant="titleMedium">Confirmation par email</Text><Text>Nous vous enverrons un lien sécurisé. Les conditions des offres disponibles seront indiquées avant votre choix.</Text></Card.Content></Card>
      <Card mode="outlined"><Card.Content style={{gap:6}}><Text variant="titleMedium">Conditions d’utilisation</Text><Text variant="bodySmall">En créant votre compte, vous acceptez les conditions d’utilisation de StockMaster et la politique de confidentialité. Vous confirmez être autorisé à engager votre entreprise.</Text><Text variant="bodySmall">Lire les documents : <Link href="/legal/terms">Conditions d’utilisation</Link> et <Link href="/legal/privacy">Politique de confidentialité</Link>.</Text></Card.Content></Card>
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      <Text variant="labelLarge" style={{ color: '#084B50', fontWeight: '800' }}>Informations obligatoires *</Text>
      <FormField control={control} name="fullName" label="Nom complet *" />
      <FormField
        control={control}
        name="email"
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField control={control} name="password" label="Mot de passe" passwordToggle />
      <Text variant="bodySmall">10 caractères minimum : majuscule, minuscule, chiffre et caractère spécial.</Text>
      <FormField
        control={control}
        name="confirmPassword"
        label="Confirmer le mot de passe"
        passwordToggle
      />
      <View style={{flexDirection:'row',alignItems:'flex-start',gap:4}}>
        <Checkbox status={acceptedLegal?'checked':'unchecked'} onPress={()=>setAcceptedLegal(value=>!value)} />
        <Text variant="bodySmall" style={{flex:1,paddingTop:8}}>
          J’accepte les <Link href="/legal/terms">conditions d’utilisation</Link> et je confirme avoir lu la <Link href="/legal/privacy">politique de confidentialité</Link>.
        </Text>
      </View>
      <AppButton onPress={submit} loading={isSubmitting} disabled={isSubmitting||!acceptedLegal}>
        Continuer vers la confirmation email
      </AppButton>
      <Link href="/(auth)/login" asChild>
        <Text style={{ textAlign: 'center' }}>J’ai déjà un compte</Text>
      </Link>
    </AuthScreen>
  );
}
