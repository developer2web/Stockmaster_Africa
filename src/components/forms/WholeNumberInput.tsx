import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput, TextInputProps } from 'react-native-paper';
import { wholeNumberError } from '@/utils/number';

// Champ de quantité entière : la saisie n'est jamais corrigée en silence
// ("-2", "1e3" ou "20,5" gardent ce qui a été tapé), elle est signalée par un
// message dès qu'elle est invalide. Les écrans qui l'utilisent lisent la valeur
// avec parseWholeNumber/wholeOrNaN, donc une saisie invalide reste refusée à la
// validation. Un champ vide n'affiche rien : c'est à l'écran de dire s'il est requis.
type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & { value: string; onChangeText: (value: string) => void };

export function WholeNumberInput({ value, onChangeText, label, error, style, ...props }: Props) {
  const message = value.trim() === '' ? null : wholeNumberError(value);
  return <View style={styles.field}>
    <TextInput mode="outlined" keyboardType="number-pad" selectTextOnFocus label={label} accessibilityLabel={typeof label === 'string' ? label : undefined} value={value} onChangeText={onChangeText} error={!!message || error} style={style} {...props} />
    {message ? <HelperText type="error" visible>{message}</HelperText> : null}
  </View>;
}

const styles = StyleSheet.create({ field: { width: '100%', minWidth: 0 } });
