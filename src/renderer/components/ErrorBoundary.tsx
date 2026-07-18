import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  componentName?: string;
  /** If true, keeps children mounted and shows error overlay instead of replacing them */
  overlay?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.componentName || 'Unknown'} crashed:`, error, errorInfo);
    try {
      const api = (window as any)?.yijingAPI?.system?.reportRendererError;
      if (typeof api === 'function') api({ label: this.props.componentName || 'Unknown', message: error?.message || String(error), stack: error?.stack || '', componentStack: errorInfo?.componentStack || '' });
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.overlay) {
        // Overlay mode: keep children mounted, show error banner on top
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {this.props.children}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              padding: '8px 16px',
              background: 'rgba(255, 60, 60, 0.95)',
              color: '#fff',
              fontSize: 12,
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <span>⚠️ {this.props.componentName}: {this.state.error?.message}</span>
              <button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.4)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >忽略</button>
            </div>
          </div>
        );
      }
      return (
        <div style={{
          padding: 40,
          color: '#ff6b6b',
          background: '#111',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h2>❌ 组件崩溃</h2>
          <p><strong>组件：</strong>{this.props.componentName || '未知'}</p>
          <p><strong>错误：</strong>{this.state.error?.message}</p>
          <pre style={{ fontSize: 12, marginTop: 20, color: '#999' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
