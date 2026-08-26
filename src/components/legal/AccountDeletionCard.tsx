import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput } from 'react-native-paper';

import { requestAccountDeletion } from '@/features/account/api';
import { AppButton } from '@/components/ui/AppButton';

export function AccountDeletionCard() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const deletion = useMutation({
    mutationFn: () => requestAccountDeletion(reason),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setConfirmation('');
    },
  });

  return <>
    <Card mode="outlined">
      <Card.Title
        title="Suppression du compte"
        subtitle="Demander la fermeture du compte et l’effacement des données associées"
        left={() => <Icon source="account-remove-outline" size={28} color="#C92A2A" />}
      />
      <Card.Content>
        <Text>Les données sans obligation de conservation seront supprimées ou anonymisées. Les écritures légalement nécessaires peuvent être archivées avec un accès restreint pendant la durée applicable.</Text>
      </Card.Content>
      <Card.Actions>
        <AppButton mode="text" textColor="#C92A2A" onPress={() => setOpen(true)}>Demander la suppression</AppButton>
      </Card.Actions>
    </Card>
    {deletion.isSuccess && <HelperText type="info" visible>Votre demande a été enregistrée. Vous serez informé de son traitement.</HelperText>}

    <Portal>
      <Dialog visible={open} onDismiss={() => !deletion.isPending && setOpen(false)}>
        <Dialog.Title>Supprimer mon compte</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <Text>Cette demande concerne le compte et les données personnelles associées. Elle ne remplace pas l’annulation d’un abonnement géré par une boutique d’applications.</Text>
          <Text>Pour confirmer votre intention, écrivez SUPPRIMER ci-dessous.</Text>
          <TextInput mode="outlined" label="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
          <TextInput mode="outlined" label="Confirmation" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
          {!!deletion.error && <HelperText type="error" visible>{deletion.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          <AppButton mode="text" disabled={deletion.isPending} onPress={() => setOpen(false)}>Annuler</AppButton>
          <AppButton buttonColor="#C92A2A" loading={deletion.isPending} disabled={deletion.isPending || confirmation.trim().toUpperCase() !== 'SUPPRIMER'} onPress={() => deletion.mutate()}>Envoyer la demande</AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  </>;
}

