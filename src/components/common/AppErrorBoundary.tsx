import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../../lib/i18n';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  failed: boolean;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        <h1>{t('crash.title')}</h1>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          {t('crash.retry')}
        </button>
      </div>
    );
  }
}
