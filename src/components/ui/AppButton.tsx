import { Button, ButtonProps } from 'react-native-paper';

export function AppButton({contentStyle,labelStyle,...props}: ButtonProps) {
  return <Button mode="contained" {...props} contentStyle={[{ minHeight: 48 },contentStyle]} labelStyle={[{fontWeight:'800'},labelStyle]} />;
}
