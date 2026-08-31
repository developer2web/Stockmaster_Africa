import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  beginMfaEnrollment,
  listMfaFactors,
  removeMfaFactor,
  signOutAllDevices,
  verifyMfaEnrollment,
} from '@/features/account/security';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SecuritySettings() {
  const theme=useTheme();
  const {width}=useWindowDimensions();
  const compact=width<600;
  const qrSize=Math.max(160,Math.min(220,width-88));
  const { membership, signOut } = useAuth();
  const cache = useQueryClient();
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: listMfaFactors });
  const [enrollment, setEnrollment] = useState<Awaited<ReturnType<typeof beginMfaEnrollment>> | null>(null);
  const [code, setCode] = useState('');
  const [globalOpen, setGlobalOpen] = useState(false);
  const enroll = useMutation({ mutationFn: beginMfaEnrollment, onSuccess: setEnrollment });
  const verify = useMutation({
    mutationFn: () => verifyMfaEnrollment(enrollment!.id, code),
    onSuccess: async () => {
      setEnrollment(null);
      setCode('');
      await cache.invalidateQueries({ queryKey: ['mfa-factors'] });
    },
  });
  const remove = useMutation({
    mutationFn: removeMfaFactor,
    onSuccess: () => cache.invalidateQueries({ queryKey: ['mfa-factors'] }),
  });
  const global = useMutation({ mutationFn: signOutAllDevices, onSuccess: () => signOut() });
  const verified = (factors.data ?? []).filter((factor) => factor.status === 'verified');

  return (
    <AdminPage title="Sécurité">
      <Card mode="contained">
        <Card.Content style={styles.stack}>
          <View style={styles.securityHeader}><View style={[styles.securityIcon,{backgroundColor:theme.colors.primaryContainer}]}><Icon source={verified.length?'shield-check':'shield-alert'} size={28} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>Authentification à deux facteurs</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{verified.length?'Protection activée':'Protection recommandée pour les comptes sensibles'}</Text></View><Chip icon={verified.length?'check':'minus'}>{verified.length?'Activée':'Inactive'}</Chip></View>
          <Text>Une application comme Google Authenticator, Microsoft Authenticator ou Authy générera un code temporaire après votre mot de passe.</Text>
        </Card.Content>
        {!verified.length && !enrollment && (
          <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
            <AppButton style={compact&&styles.mobileButton} icon="shield-plus" loading={enroll.isPending} onPress={() => enroll.mutate()}>Activer la 2FA</AppButton>
          </Card.Actions>
        )}
      </Card>

      {enrollment && (
        <Card mode="outlined">
          <Card.Title title="Scanner le QR code" subtitle="Puis saisissez le code à 6 chiffres" />
          <Card.Content style={styles.enrollment}>
            <Image source={{ uri: enrollment.totp.qr_code }} style={{ width: qrSize, height: qrSize }} contentFit="contain" />
            <Text selectable style={styles.secret}>Clé manuelle : {enrollment.totp.secret.match(/.{1,4}/g)?.join(' ')??enrollment.totp.secret}</Text>
            <TextInput
              style={{ width: '100%' }}
              mode="outlined"
              label="Code de vérification"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            {!!verify.error && <HelperText type="error" visible>{verify.error.message}</HelperText>}
            <AppButton style={compact&&styles.mobileButton} loading={verify.isPending} disabled={code.trim().length !== 6 || verify.isPending} onPress={() => verify.mutate()}>
              Confirmer l’activation
            </AppButton>
          </Card.Content>
        </Card>
      )}

      {verified.map((factor) => (
        <Card key={factor.id} mode="outlined">
          <Card.Title title={factor.friendly_name ?? 'Application d’authentification'} subtitle="Facteur vérifié" />
          <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
            <AppButton style={compact&&styles.mobileButton} mode="text" destructive loading={remove.isPending} onPress={() => remove.mutate(factor.id)}>Désactiver</AppButton>
          </Card.Actions>
        </Card>
      ))}

      {!!enroll.error && <HelperText type="error" visible>{enroll.error.message}</HelperText>}
      <Card mode="outlined">
        <Card.Title title="Déconnecter tous les appareils" subtitle="Toutes les sessions StockMaster devront se reconnecter" />
        <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
          <AppButton style={compact&&styles.mobileButton} mode="text" destructive icon="logout-variant" onPress={() => setGlobalOpen(true)}>Tout déconnecter</AppButton>
        </Card.Actions>
      </Card>
      <HelperText type="info" visible>
        {membership?.role === 'employee'
          ? 'La 2FA protège également votre accès employé.'
          : 'La 2FA est fortement recommandée pour les comptes administrateurs.'}
      </HelperText>
      <ConfirmDialog
        visible={globalOpen}
        title="Déconnecter tous les appareils ?"
        message="Votre session actuelle et toutes les autres sessions seront fermées."
        destructive
        loading={global.isPending}
        onCancel={() => setGlobalOpen(false)}
        onConfirm={() => global.mutate()}
      />
    </AdminPage>
  );
}

const styles=StyleSheet.create({
  stack:{gap:12},securityHeader:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},securityIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:180,gap:2},bold:{fontWeight:'800'},
  enrollment:{gap:12,alignItems:'center'},secret:{width:'100%',textAlign:'center',lineHeight:22},actions:{flexWrap:'wrap',paddingHorizontal:12,paddingBottom:12},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},
});
