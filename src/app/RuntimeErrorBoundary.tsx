import { Component, type ErrorInfo, type ReactNode } from 'react';

import { notesDocumentTitle } from './documentContext';

interface RuntimeErrorBoundaryProps {
  children: ReactNode;
}

interface RuntimeErrorBoundaryState {
  failed: boolean;
}

export class RuntimeErrorBoundary extends Component<
  RuntimeErrorBoundaryProps,
  RuntimeErrorBoundaryState
> {
  state: RuntimeErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RuntimeErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Failure details are intentionally neither persisted nor exposed by this local recovery layer.
    void error;
    void info;
    document.title = notesDocumentTitle('Recovery');
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="runtime-error-screen" aria-labelledby="runtime-error-title">
          <section className="runtime-error-card" data-runtime-error-boundary>
            <p className="runtime-error-kicker">Recovery</p>
            <h1 id="runtime-error-title">Notes couldn’t open</h1>
            <p>
              A part of the interface failed while loading. This recovery screen does not clear or
              reset the notes stored in this browser.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload Notes
            </button>
            <p className="runtime-error-detail">
              If the problem continues, leave browser data intact and use your existing backup or a
              working synced device for recovery.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
