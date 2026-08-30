import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput, TextInputProps } from 'react-native-paper';
import { useState } from 'react';

type Props<T extends FieldValues> = TextInputProps & { control: Control<T>; name: FieldPath<T>; passwordToggle?: boolean; required?: boolean };

export function FormField<T extends FieldValues>({ control, name, passwordToggle=false, secureTextEntry, required=false, label, style, ...props }: Props<T>) {
  const [passwordHidden,setPasswordHidden]=useState(true);
  return (
    <Controller control={control} name={name} render={({ field: { onBlur, onChange, value }, fieldState }) => (
      <View style={styles.field}><TextInput mode="outlined" value={value == null ? '' : String(value)} onBlur={onBlur} onChangeText={onChange}
        label={typeof label==='string'&&required?`${label} *`:label}
        style={[styles.input,style]}
        secureTextEntry={passwordToggle?passwordHidden:secureTextEntry}
        right={passwordToggle?<TextInput.Icon accessibilityLabel={passwordHidden?'Afficher le mot de passe':'Masquer le mot de passe'} icon={passwordHidden?'eye':'eye-off'} onPress={()=>setPasswordHidden(value=>!value)}/>:props.right}
        error={!!fieldState.error} {...props} />{fieldState.error?.message ? <HelperText type="error" visible>{fieldState.error.message}</HelperText> : null}</View>
    )} />
  );
}

const styles=StyleSheet.create({field:{width:'100%',minWidth:0},input:{minHeight:48}});
