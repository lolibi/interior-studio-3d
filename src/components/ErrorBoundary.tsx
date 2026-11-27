import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Неочаквана грешка в 3D сцената.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('3D Studio ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#020617',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '20px',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '17px', color: '#fda4af' }}>
              Възникна грешка при визуализацията
            </h2>
            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              className="btn btn-active"
              onClick={() => window.location.reload()}
            >
              Презареди приложението
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}