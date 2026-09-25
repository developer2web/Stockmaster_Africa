import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { getMyAccountDeletionRequest, requestAccountDeletion } from '@/features/account/api';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow, ListSection } from '@/components/ui/ListSection';

// Retour testeur du 25/09 : une simple ligne cliquable (comme le reste de
// Paramètres) plutôt qu'une grande carte toujours dépliée — on entre dans la
// zone sensible en cliquant, la boîte de dialogue affiche soit la demande en
// cours, soit le formulaire de confirmation.
export function AccountDeletionCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const request = useQuery({
    queryKey: ['my-account-deletion-request'],
    queryFn: getMyAccountDeletionRequest,
  });
  const activeRequest = request.data && ['pending', 'processing'].includes(request.data.status)
    ? request.data
    : null;
  const deletion = useMutation({ meta: { allowReadOnly: true },
    mutationFn: () => requestAccountDeletion(reason),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setConfirmation('');
      await queryClient.invalidateQueries({ queryKey: ['my-account-deletion-request'] });
    },
  });

  return <>
    <ListSection title="Zone sensible">
      <ListRow
        icon="account-remove-outline"
        title={activeRequest ? 'Demande de suppression en cours' : 'Supprimer mon compte'}
        subtitle={activeRequest ? (activeRequest.status === 'processing' ? 'Votre demande est en cours de traitement' : 'Votre demande a bien été enregistrée') : 'Fermeture du compte et effacement des données associées'}
        danger
        last
        onPress={() => setOpen(true)}
      />
    </ListSection>
    {!!request.error && <HelperText type="error" visible>Impossible de vérifier l’état de la demande : {request.error.message}</HelperText>}

    <Portal>
      <Dialog style={styles.dialog} visible={open} onDismiss={() => !deletion.isPending && setOpen(false)}>
        <Dialog.Title>{activeRequest ? 'Demande de suppression' : 'Supprimer mon compte'}</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          {activeRequest ? <>
            <Text>Demande envoyée le {new Date(activeRequest.requestedAt).toLocaleDateString('fr-FR')}. Vous serez informé dès que son traitement sera terminé.</Text>
            {!!activeRequest.reason && <Text>Motif : {activeRequest.reason}</Text>}
          </> : <>
            <Text>Cette demande concerne le compte et les données personnelles associées. Elle ne remplace pas l’annulation d’un abonnement géré par une boutique d’applications.</Text>
            <Text>Les données sans obligation de conservation seront supprimées ou anonymisées. Les écritures légalement nécessaires peuvent être archivées avec un accès restreint pendant la durée applicable.</Text>
            <Text>Pour confirmer votre intention, écrivez SUPPRIMER ci-dessous.</Text>
            <TextInput mode="outlined" label="Raison (facultatif)" accessibilityLabel="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
            <TextInput mode="outlined" label="Confirmation" accessibilityLabel="Confirmation" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
            {!!deletion.error && <HelperText type="error" visible>{deletion.error.message}</HelperText>}
          </>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          <AppButton mode="text" disabled={deletion.isPending} onPress={() => setOpen(false)}>{activeRequest ? 'Fermer' : 'Annuler'}</AppButton>
          {!activeRequest && <AppButton buttonColor="#C92A2A" loading={deletion.isPending} disabled={deletion.isPending || confirmation.trim().toUpperCase() !== 'SUPPRIMER'} onPress={() => deletion.mutate()}>Envoyer la demande</AppButton>}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  </>;
}

const styles = StyleSheet.create({ dialog: { width: '92%', maxWidth: 520, alignSelf: 'center' } });
