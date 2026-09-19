import { StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';

// Croix de fermeture en haut à droite d'une fenêtre. À placer avant le titre
// (Dialog.Title) : le titre doit réserver DIALOG_TITLE_PADDING à droite pour ne
// pas passer dessous.
export const DIALOG_TITLE_PADDING = { paddingRight: 48 };

export function DialogCloseButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  return <IconButton icon="close" accessibilityLabel="Fermer la fenêtre" disabled={disabled} onPress={onPress} style={styles.close} />;
}

const styles = StyleSheet.create({ close: { position: 'absolute', top: 6, right: 6, margin: 0, zIndex: 2 } });
