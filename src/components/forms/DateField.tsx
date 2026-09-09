import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Icon, IconButton, Text, useTheme } from 'react-native-paper';
import { calendarDateAllowed, calendarDays, localDateValue, parseCalendarDate } from '@/utils/calendar';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  minDate?: string;
  maxDate?: string;
  error?: string;
  disabled?: boolean;
};

export function DateField({ label, value, onChange, onBlur, minDate, maxDate, error, disabled }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const selected = parseCalendarDate(value);
  const today = localDateValue();
  const display = selected?.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) ?? 'Choisir une date';
  const close = () => { setOpen(false); onBlur?.(); };
  const choose = (date: string) => { onChange(date); close(); };
  const moveMonth = (offset: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
  return (
    <View style={styles.field}>
      <Text variant="labelMedium" style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button" accessibilityLabel={`${label} : ${display}`} accessibilityHint="Ouvre le calendrier"
        accessibilityState={{ disabled, expanded: open }} aria-expanded={open} disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          const initial = value || today;
          const bounded = minDate && initial < minDate ? minDate : maxDate && initial > maxDate ? maxDate : initial;
          setMonth(parseCalendarDate(bounded) ?? new Date()); setOpen(true);
        }}
        style={[styles.trigger, { borderColor: error ? theme.colors.error : theme.colors.outline, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={styles.date}>{display}</Text><Icon source="calendar-month-outline" size={24} color={theme.colors.primary} />
      </Pressable>
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Fermer le calendrier" />
          <View style={[styles.calendar, { backgroundColor: theme.colors.surface }]} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text variant="titleMedium" accessibilityRole="header">{label}</Text>
              <View style={styles.navigation}>
                <IconButton icon="chevron-left" accessibilityLabel="Mois précédent" onPress={() => moveMonth(-1)} />
                <Text style={styles.month} accessibilityLiveRegion="polite">{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>
                <IconButton icon="chevron-right" accessibilityLabel="Mois suivant" onPress={() => moveMonth(1)} />
              </View>
              <View style={styles.grid}>
                {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(day => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}
                {calendarDays(month.getFullYear(), month.getMonth()).map((date, index) => {
                  const allowed = !!date && calendarDateAllowed(date, minDate, maxDate);
                  return <View key={date ?? `empty-${index}`} style={styles.cell}>{date && <Pressable
                    accessibilityRole="button" accessibilityLabel={parseCalendarDate(date)!.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    accessibilityState={{ selected: date === value, disabled: !allowed }} disabled={!allowed}
                    onPress={() => choose(date)}
                    style={[styles.day, { backgroundColor: date === value ? theme.colors.primary : 'transparent', borderColor: date === today ? theme.colors.primary : 'transparent', opacity: allowed ? 1 : 0.35 }]}
                  ><Text style={{ color: date === value ? theme.colors.onPrimary : theme.colors.onSurface }}>{Number(date.slice(-2))}</Text></Pressable>}</View>;
                })}
              </View>
              <View style={styles.actions}>
                <Button disabled={!calendarDateAllowed(today, minDate, maxDate)} onPress={() => choose(today)}>Aujourd’hui</Button>
                <Button onPress={close}>Annuler</Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', minWidth: 0 }, label: { marginBottom: 6 },
  trigger: { minHeight: 52, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  calendar: { width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 20, overflow: 'hidden' },
  content: { padding: 12 }, navigation: { flexDirection: 'row', alignItems: 'center' },
  month: { flex: 1, textAlign: 'center', fontWeight: '700', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857142857%', alignItems: 'center' },
  weekday: { paddingVertical: 8, fontWeight: '600' },
  day: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 8 },
});
