import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput } from 'react-native-paper';

import { getMyAccountDeletionRequest, requestAccountDeletion } from '@/features/account/api';
import { AppButton } from '@/components/ui/AppButton';

export function AccountDeletionCard() {
  const {width}=useWindowDimensions();
  const compact=width<600;
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
    <Card mode="outlined">
      <Card.Content style={styles.content}>
        <View style={styles.header}><View style={styles.icon}><Icon source="account-remove-outline" size={27} color="#C92A2A" /></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{activeRequest?'Demande de suppression en cours':'Suppression du compte'}</Text><Text>{activeRequest?(activeRequest.status==='processing'?'Votre demande est en cours de traitement':'Votre demande a bien été enregistrée'):'Demander la fermeture du compte et l’effacement des données associées'}</Text></View></View>
        {activeRequest ? <>
          <Text>Demande envoyée le {new Date(activeRequest.requestedAt).toLocaleDateString('fr-FR')}. Vous serez informé dès que son traitement sera terminé.</Text>
          {!!activeRequest.reason && <Text>Motif : {activeRequest.reason}</Text>}
        </> : <Text>Les données sans obligation de conservation seront supprimées ou anonymisées. Les écritures légalement nécessaires peuvent être archivées avec un accès restreint pendant la durée applicable.</Text>}
      </Card.Content>
      {!activeRequest && !request.isLoading && <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
        <AppButton style={compact&&styles.mobileButton} mode="text" textColor="#C92A2A" onPress={() => setOpen(true)}>Demander la suppression</AppButton>
      </Card.Actions>}
    </Card>
    {!!request.error && <HelperText type="error" visible>Impossible de vérifier l’état de la demande : {request.error.message}</HelperText>}

    <Portal>
      <Dialog style={styles.dialog} visible={open} onDismiss={() => !deletion.isPending && setOpen(false)}>
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

const styles=StyleSheet.create({content:{gap:12},header:{flexDirection:'row',alignItems:'flex-start',gap:12},icon:{width:44,height:44,borderRadius:14,backgroundColor:'#FDECEC',alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:3},bold:{fontWeight:'800'},actions:{flexWrap:'wrap'},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},dialog:{width:'92%',maxWidth:520,alignSelf:'center'}});
