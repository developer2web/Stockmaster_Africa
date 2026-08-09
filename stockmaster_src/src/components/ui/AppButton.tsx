import { Button, ButtonProps } from 'react-native-paper';

export function AppButton({contentStyle,...props}: ButtonProps) {
  return <Button mode="contained" contentStyle={[{ minHeight: 48 },contentStyle]} {...props} />;
}
