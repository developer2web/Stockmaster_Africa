import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { requestAccountDeletion } from '@/features/account/api';

export default function SettingsScreen() {
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const deletion = useMutation({
    mutationFn: () => requestAccountDeletion(reason),
    onSuccess: () => setDeletionOpen(false),
  });

  return (
    <AdminPage title="Paramètres">
      <Card mode="outlined" onPress={() => router.push('/legal/privacy' as never)}>
        <Card.Title title="Politique de confidentialité" subtitle="Utilisation et protection de vos données" left={() => <Icon source="shield-lock-outline" size={28} />} />
      </Card>
      <Card mode="outlined" onPress={() => router.push('/legal/terms' as never)}>
        <Card.Title title="Conditions d’utilisation" subtitle="Règles du service et abonnements" left={() => <Icon source="file-document-outline" size={28} />} />
      </Card>
      <Card mode="outlined">
        <Card.Title title="Suppression du compte" subtitle="Demander la fermeture sécurisée de votre compte" left={() => <Icon source="account-remove-outline" size={28} />} />
        <Card.Content>
          <Text>La demande est vérifiée avant suppression. Les écritures financières légalement nécessaires peuvent être archivées.</Text>
        </Card.Content>
        <Card.Actions><AppButton textColor="#C92A2A" onPress={() => setDeletionOpen(true)}>Demander la suppression</AppButton></Card.Actions>
      </Card>
      {deletion.isSuccess && <HelperText type="info" visible>Votre demande de suppression a été enregistrée.</HelperText>}
      <Portal>
        <Dialog visible={deletionOpen} onDismiss={() => setDeletionOpen(false)}>
          <Dialog.Title>Supprimer votre compte ?</Dialog.Title>
          <Dialog.Content>
            <Text>Cette demande sera examinée avant la fermeture définitive du compte.</Text>
            <TextInput mode="outlined" label="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
            {!!deletion.error && <HelperText type="error" visible>{deletion.error.message}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setDeletionOpen(false)}>Annuler</AppButton>
            <AppButton buttonColor="#C92A2A" loading={deletion.isPending} onPress={() => deletion.mutate()}>Confirmer la demande</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </AdminPage>
  );
}
