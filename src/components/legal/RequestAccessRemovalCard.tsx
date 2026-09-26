import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { requestEmployeeAccessRemoval } from '@/features/account/api';
import { AppButton } from '@/components/ui/AppButton';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { ListRow, ListSection } from '@/components/ui/ListSection';

// Option B (25/09) : plutôt que de faire remonter la demande d'un employé au
// Super Admin (illogique — lui seul crée/gère son compte StockMaster
// multi-entreprise), cette action notifie directement le ou les admin(s) de
// CETTE entreprise, qui retirent ensuite l'accès avec l'outil déjà existant
// ("Retirer l'accès" dans (admin)/employees.tsx). Aucun nouveau statut/écran
// de suivi : la notification est la seule trace de la demande.
//
// Revue du 26/09 : initialement une section séparée ("Quitter l'entreprise")
// à côté de l'ancien "Supprimer mon compte" (AccountDeletionCard, routé
// Super Admin) — les deux options, visuellement proches dans Zone sensible,
// ont directement causé une confusion en test (mauvais bouton cliqué).
// Sur demande explicite, ce composant reprend maintenant le libellé
// "Supprimer mon compte" ET la seule place dans Zone sensible côté employé :
// AccountDeletionCard ne s'affiche plus du tout ici (il reste inchangé côté
// admin/propriétaire dans (settings)/index.tsx, où il n'y a par définition
// aucun administrateur de l'entreprise à notifier).
export function RequestAccessRemovalCard({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const request = useMutation({
    mutationFn: () => requestEmployeeAccessRemoval(companyId, reason),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setFeedback('Votre demande a été envoyée à l’administrateur de l’entreprise.');
    },
  });

  return <>
    <ListSection title="Zone sensible">
      <ListRow
        icon="account-remove-outline"
        title="Supprimer mon compte"
        subtitle="Une notification sera envoyée à l’administrateur, qui retirera votre accès"
        danger
        last
        onPress={() => setOpen(true)}
      />
    </ListSection>

    <Portal>
      <Dialog style={styles.dialog} visible={open} onDismiss={() => !request.isPending && setOpen(false)}>
        <Dialog.Title>Supprimer mon compte</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <Text>L’administrateur de l’entreprise recevra une notification et retirera votre accès à cette entreprise. Cela ne supprime pas votre identifiant StockMaster (utile si vous accédez à d’autres entreprises) — seul cet accès est concerné.</Text>
          <TextInput mode="outlined" label="Raison (facultatif)" accessibilityLabel="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
          {!!request.error && <HelperText type="error" visible>{request.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          <AppButton mode="text" disabled={request.isPending} onPress={() => setOpen(false)}>Annuler</AppButton>
          <AppButton buttonColor="#C92A2A" loading={request.isPending} disabled={request.isPending} onPress={() => request.mutate()}>Envoyer la demande</AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
    {!!feedback && <AppFeedback message={feedback} onDismiss={() => setFeedback('')} />}
  </>;
}

const styles = StyleSheet.create({ dialog: { width: '92%', maxWidth: 520, alignSelf: 'center' } });
