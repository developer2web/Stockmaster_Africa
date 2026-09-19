import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput, TextInputProps } from 'react-native-paper';

// Champ simple (hors react-hook-form) avec état d'erreur accessible : aria-required, aria-invalid,
// et message d'erreur relié au champ par aria-describedby — lus par un lecteur d'écran avec le champ.
type Props = TextInputProps & { errorText?: string; required?: boolean };

export function ValidatedInput({ errorText, required = false, label, error, style, ...props }: Props) {
  const errorId = `${useId()}-error`;
  const invalid = !!errorText || !!error;
  return <View style={styles.field}>
    <TextInput
      mode="outlined"
      label={typeof label === 'string' && required ? `${label} *` : label}
      accessibilityLabel={typeof label === 'string' ? label : undefined}
      aria-required={required || undefined}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={errorText ? errorId : undefined}
      error={invalid}
      style={style}
      {...props}
    />
    {errorText ? <HelperText type="error" visible nativeID={errorId}>{errorText}</HelperText> : null}
  </View>;
}

const styles = StyleSheet.create({ field: { width: '100%', minWidth: 0 } });
