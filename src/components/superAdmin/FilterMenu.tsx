import { useState } from 'react';
import { Button, Menu } from 'react-native-paper';

type Option = { label: string; value: string };

export function FilterMenu({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? label;

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={<Button mode="outlined" compact icon="chevron-down" onPress={() => setOpen(true)}>{selected}</Button>}
    >
      {options.map((option) => (
        <Menu.Item
          key={option.value}
          title={option.label}
          leadingIcon={option.value === value ? 'check' : undefined}
          onPress={() => { onChange(option.value); setOpen(false); }}
        />
      ))}
    </Menu>
  );
}
