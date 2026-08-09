import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';
import { View } from 'react-native';
import { HelperText, TextInput, TextInputProps } from 'react-native-paper';
import { useState } from 'react';

type Props<T extends FieldValues> = TextInputProps & { control: Control<T>; name: FieldPath<T>; passwordToggle?: boolean };

export function FormField<T extends FieldValues>({ control, name, passwordToggle=false, secureTextEntry, ...props }: Props<T>) {
  const [passwordHidden,setPasswordHidden]=useState(true);
  return (
    <Controller control={control} name={name} render={({ field: { onBlur, onChange, value }, fieldState }) => (
      <View><TextInput mode="outlined" value={value == null ? '' : String(value)} onBlur={onBlur} onChangeText={onChange}
        secureTextEntry={passwordToggle?passwordHidden:secureTextEntry}
        right={passwordToggle?<TextInput.Icon accessibilityLabel={passwordHidden?'Afficher le mot de passe':'Masquer le mot de passe'} icon={passwordHidden?'eye':'eye-off'} onPress={()=>setPasswordHidden(value=>!value)}/>:props.right}
        error={!!fieldState.error} {...props} /><HelperText type="error" visible={!!fieldState.error}>{fieldState.error?.message}</HelperText></View>
    )} />
  );
}
