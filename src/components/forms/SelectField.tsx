import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, HelperText, Menu, Text } from 'react-native-paper';

export interface SelectOption { label: string; value: string | null }

export function SelectField({ label, value, options, error, required = false, disabled = false, onChange }: {
  label: string;
  value: string | null;
  options: SelectOption[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={styles.field}>
      <Text variant="labelMedium" style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        // Avoid an initial close animation cancelling a quick first selection.
        theme={{ animation: { scale: 0 } }}
        contentStyle={[styles.menu, { width: Math.min(360, width - 32), minWidth: Math.min(240, width - 32), maxHeight: Math.min(360, height * 0.6) }]}
        anchor={
          // Améliore l'accessibilité (demande explicite du 17/09) : le
          // bouton n'avait aucun accessibilityLabel, seul un <Text> visuel
          // séparé portait le nom du champ ("Fournisseur") — un lecteur
          // d'écran n'annonçait donc que "Sélectionner" ou la valeur
          // choisie, sans jamais dire de quel champ il s'agit.
          <Button
            disabled={disabled}
            style={styles.anchor}
            mode="outlined"
            icon="chevron-down"
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            accessibilityLabel={`${label}${required ? ' (obligatoire)' : ''} : ${selected?.label ?? 'aucune sélection'}`}
            onPress={() => setOpen(true)}
          >
            {selected?.label ?? 'Sélectionner'}
          </Button>
        }
      >
        {options.map((option) => (
          <Menu.Item key={option.value ?? 'none'} title={option.label} onPress={() => { onChange(option.value); setOpen(false); }} />
        ))}
      </Menu>
      {error ? <HelperText type="error" visible>{error}</HelperText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', minWidth: 0 },
  label: { marginBottom: 6, fontWeight: '700' },
  anchor: { width: '100%', borderRadius: 12 },
  buttonContent: { minHeight: 48, justifyContent: 'space-between', flexDirection: 'row-reverse' },
  buttonLabel: { flex: 1, textAlign: 'left' },
  menu: { maxHeight: 360, minWidth: 240 },
});
