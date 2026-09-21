import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, Dialog, HelperText, Icon, Portal, Text, TextInput, useTheme } from 'react-native-paper';
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
import { applyApprovedAccountEmailChange, getMyEmailChangeRequests, requestEmailChange } from '@/features/account/api';
import { readableError } from '@/utils/errors';

export default function SecuritySettings() {
  const theme=useTheme();
  const {width}=useWindowDimensions();
  const compact=width<600;
  const qrSize=Math.max(160,Math.min(220,width-88));
  const { membership, session, signOut } = useAuth();
  const cache = useQueryClient();
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: listMfaFactors });
  const [enrollment, setEnrollment] = useState<Awaited<ReturnType<typeof beginMfaEnrollment>> | null>(null);
  const [code, setCode] = useState('');
  const [globalOpen, setGlobalOpen] = useState(false);
  const companyId = membership?.companyId ?? '';
  const isAdmin = membership?.role !== 'employee' && membership?.role !== 'super_admin';
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [accountEmailReason, setAccountEmailReason] = useState('');
  const emailRequests = useQuery({ queryKey: ['email-change-requests', companyId], queryFn: () => getMyEmailChangeRequests(companyId), enabled: !!companyId && isAdmin });
  const pendingAccountEmailRequest = emailRequests.data?.find((request) => request.target === 'account_email' && request.status === 'pending');
  const approvedAccountEmailRequest = emailRequests.data?.find((request) => request.target === 'account_email' && request.status === 'approved');
  const accountEmailMutation = useMutation({
    mutationFn: () => requestEmailChange(companyId, 'account_email', newAccountEmail, accountEmailReason),
    onSuccess: async () => { setEmailDialogOpen(false); setNewAccountEmail(''); setAccountEmailReason(''); await cache.invalidateQueries({ queryKey: ['email-change-requests', companyId] }); },
  });
  const applyEmailChange = useMutation({
    mutationFn: () => applyApprovedAccountEmailChange(approvedAccountEmailRequest!),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['email-change-requests', companyId] }),
  });
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

      {isAdmin && (
        <Card mode="outlined">
          <Card.Title title="Email de connexion" subtitle={session?.user.email ?? 'Non renseigné'} />
          <Card.Content style={{ gap: 8 }}>
            {/* Demande explicite (21/09) : l'email de connexion du
                propriétaire ne doit plus être modifiable directement — toute
                modification passe par une demande approuvée par le Super
                Admin, pour éviter un changement silencieux (perte d'accès,
                détournement de compte). */}
            {approvedAccountEmailRequest ? (
              <>
                <HelperText type="info" visible>Demande approuvée : {approvedAccountEmailRequest.requestedEmail}. Confirmez pour recevoir l’email de vérification à cette nouvelle adresse.</HelperText>
                {!!applyEmailChange.error && <HelperText type="error" visible>{readableError(applyEmailChange.error)}</HelperText>}
              </>
            ) : pendingAccountEmailRequest ? (
              <HelperText type="info" visible>Demande en attente d’approbation par le Super Admin : {pendingAccountEmailRequest.requestedEmail}</HelperText>
            ) : null}
          </Card.Content>
          <Card.Actions style={[styles.actions, compact && styles.actionsCompact]}>
            {approvedAccountEmailRequest ? (
              <AppButton style={compact && styles.mobileButton} loading={applyEmailChange.isPending} onPress={() => applyEmailChange.mutate()}>Confirmer le changement</AppButton>
            ) : !pendingAccountEmailRequest && (
              <AppButton style={compact && styles.mobileButton} mode="text" icon="email-edit-outline" onPress={() => { setNewAccountEmail(session?.user.email ?? ''); setEmailDialogOpen(true); }}>Demander la modification</AppButton>
            )}
          </Card.Actions>
        </Card>
      )}

      <Card mode="outlined">
        <Card.Title title="Déconnecter tous les appareils" subtitle="Toutes les sessions StockMaster devront se reconnecter" />
        <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
          <AppButton style={compact&&styles.mobileButton} mode="text" icon="logout-variant" onPress={() => setGlobalOpen(true)}>Tout déconnecter</AppButton>
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
      <Portal>
        <Dialog visible={emailDialogOpen} onDismiss={() => setEmailDialogOpen(false)}>
          <Dialog.Title>Demander la modification de l’email</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text>Cette demande sera envoyée au Super Admin pour approbation.</Text>
            <TextInput mode="outlined" label="Nouvel email" accessibilityLabel="Nouvel email" keyboardType="email-address" autoCapitalize="none" value={newAccountEmail} onChangeText={setNewAccountEmail} />
            <TextInput mode="outlined" label="Motif (facultatif)" accessibilityLabel="Motif" value={accountEmailReason} onChangeText={setAccountEmailReason} />
            {!!accountEmailMutation.error && <HelperText type="error" visible>{readableError(accountEmailMutation.error)}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setEmailDialogOpen(false)}>Annuler</AppButton>
            <AppButton loading={accountEmailMutation.isPending} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newAccountEmail.trim())} onPress={() => accountEmailMutation.mutate()}>Envoyer la demande</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </AdminPage>
  );
}

const styles=StyleSheet.create({
  stack:{gap:12},securityHeader:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},securityIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:180,gap:2},bold:{fontWeight:'800'},
  enrollment:{gap:12,alignItems:'center'},secret:{width:'100%',textAlign:'center',lineHeight:22},actions:{flexWrap:'wrap',paddingHorizontal:12,paddingBottom:12},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},
});
