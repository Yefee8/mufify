import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { i18n } from '@/i18n';

import { ErrorState } from './ErrorState';

export interface TabErrorBoundaryProps {
  children: ReactNode;
}

interface TabErrorBoundaryState {
  hasError: boolean;
}

/** Keeps a render failure inside one tab instead of taking down the whole app. */
// React render error boundaries require a class component.
export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  override state: TabErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): TabErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) console.error('Tab render failed:', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View className="flex-1 bg-surface">
          <ErrorState
            message={i18n.t('common.unexpectedError')}
            retryLabel={i18n.t('common.tryAgain')}
            onRetry={this.retry}
          />
        </View>
      );
    }

    return this.props.children;
  }
}
