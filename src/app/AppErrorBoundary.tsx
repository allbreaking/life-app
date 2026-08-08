import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  /** Side effects: logs unexpected render errors to the local developer console. */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Life-OS render failure', error, info.componentStack);
  }

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <h1>Life-OS 暂时无法显示</h1>
          <p>数据没有被修改。请重新启动应用；若问题持续，请从备份恢复。</p>
        </main>
      );
    }
    return this.props.children;
  }
}
