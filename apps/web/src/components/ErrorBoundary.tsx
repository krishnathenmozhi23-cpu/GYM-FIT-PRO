import { Component, type ErrorInfo, type ReactNode } from "react";

/** Last-resort boundary so a rendering bug shows a recovery screen, not a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell">
        <div className="center-state" style={{ minHeight: "80dvh" }} role="alert">
          <p style={{ color: "var(--text)", fontWeight: 700 }}>Something went wrong</p>
          <p className="small">Your logged data is safe. Reload to continue.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
