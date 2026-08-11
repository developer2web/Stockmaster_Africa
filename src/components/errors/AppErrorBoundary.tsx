import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Component } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { logger } from '@/services/observability/logger';

type State = { error: Error | null };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void logger.fatal('react_render_crash', error, {
      componentStack: info.componentStack,
    });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall">StockMaster a rencontré une erreur</Text>
        <Text style={styles.message}>
          L’incident a été enregistré. Vous pouvez réessayer sans fermer l’application.
        </Text>
        <Button mode="contained" onPress={this.reset}>Réessayer</Button>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  message: {
    maxWidth: 480,
    textAlign: 'center',
  },
});
