import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { getMyEmployeeAccessRemovalRequest, requestEmployeeAccessRemoval } from '@/features/account/api';
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
// Revue du 26/09 (deux retours testeur) :
// 1. Initialement une section séparée ("Quitter l'entreprise") à côté de
//    l'ancien "Supprimer mon compte" (AccountDeletionCard, routé Super
//    Admin) — les deux options, visuellement proches dans Zone sensible,
//    ont directement causé une confusion en test (mauvais bouton cliqué).
//    AccountDeletionCard ne s'affiche donc plus du tout côté employé (reste
//    inchangé côté admin/propriétaire, seul cas où il n'y a par définition
//    aucun administrateur de l'entreprise à notifier).
// 2. Renommé "Demande de retrait" (plus exact que "Supprimer mon compte",
//    qui ne supprime pas le compte StockMaster) et bloqué tant qu'une
//    demande est déjà en cours — sans nouvelle table de statut, la requête
//    reste "en cours" tant que l'employé peut encore voir cet écran : si
//    l'administrateur avait traité la demande, son accès serait révoqué et
//    il ne pourrait plus charger cette page du tout.
export function RequestAccessRemovalCard({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const requestQuery = useQuery({
    queryKey: ['my-employee-access-removal-request', companyId],
    queryFn: () => getMyEmployeeAccessRemovalRequest(companyId),
    enabled: !!companyId,
  });
  const activeRequest = requestQuery.data;
  const request = useMutation({
    mutationFn: () => requestEmployeeAccessRemoval(companyId, reason),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setFeedback('Votre demande a été envoyée à l’administrateur de l’entreprise.');
      await queryClient.invalidateQueries({ queryKey: ['my-employee-access-removal-request', companyId] });
    },
  });

  return <>
    <ListSection title="Zone sensible">
      <ListRow
        icon="account-remove-outline"
        title={activeRequest ? 'Demande de retrait en cours' : 'Demande de retrait'}
        subtitle={activeRequest ? 'L’administrateur a été notifié et doit encore la traiter' : 'Une notification sera envoyée à l’administrateur, qui retirera votre accès'}
        danger
        last
        onPress={() => setOpen(true)}
      />
    </ListSection>
    {!!requestQuery.error && <HelperText type="error" visible>Impossible de vérifier l’état de la demande : {requestQuery.error.message}</HelperText>}

    <Portal>
      <Dialog style={styles.dialog} visible={open} onDismiss={() => !request.isPending && setOpen(false)}>
        <Dialog.Title>Demande de retrait</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          {activeRequest ? <>
            <Text>Demande envoyée le {new Date(activeRequest.createdAt).toLocaleDateString('fr-FR')}. L’administrateur de l’entreprise a été notifié et retirera votre accès dès traitement.</Text>
          </> : <>
            <Text>L’administrateur de l’entreprise recevra une notification et retirera votre accès à cette entreprise. Cela ne supprime pas votre identifiant StockMaster (utile si vous accédez à d’autres entreprises) — seul cet accès est concerné.</Text>
            <TextInput mode="outlined" label="Raison (facultatif)" accessibilityLabel="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
            {!!request.error && <HelperText type="error" visible>{request.error.message}</HelperText>}
          </>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          <AppButton mode="text" disabled={request.isPending} onPress={() => setOpen(false)}>{activeRequest ? 'Fermer' : 'Annuler'}</AppButton>
          {!activeRequest && <AppButton buttonColor="#C92A2A" loading={request.isPending} disabled={request.isPending} onPress={() => request.mutate()}>Envoyer la demande</AppButton>}
        </Dialog.Actions>
      </Dialog>
    </Portal>
    {!!feedback && <AppFeedback message={feedback} onDismiss={() => setFeedback('')} />}
  </>;
}

const styles = StyleSheet.create({ dialog: { width: '92%', maxWidth: 520, alignSelf: 'center' } });
