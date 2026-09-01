import { StyleSheet } from 'react-native';
import { Button, ButtonProps, useTheme } from 'react-native-paper';

type Props = ButtonProps & { destructive?: boolean; loadingLabel?: string };

export function AppButton({contentStyle,labelStyle,style,destructive=false,disabled,loading,loadingLabel,children,...props}: Props) {
  const theme=useTheme();
  const mode=props.mode??'contained';
  return <Button
    {...props}
    mode={mode}
    disabled={disabled||loading}
    loading={loading}
    buttonColor={destructive&&mode==='contained'?theme.colors.error:props.buttonColor}
    textColor={destructive&&mode!=='contained'?theme.colors.error:props.textColor}
    style={[styles.button,style]}
    contentStyle={[styles.content,contentStyle]}
    labelStyle={[styles.label,labelStyle]}
  >{loading?(loadingLabel??'Traitement…'):children}</Button>;
}

const styles=StyleSheet.create({
  button:{borderRadius:12},
  content:{minHeight:48,paddingHorizontal:4},
  label:{fontWeight:'800',letterSpacing:.1},
});
