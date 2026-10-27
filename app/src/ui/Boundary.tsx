import { Component, type ReactNode } from 'react';

// Keeps one broken screen from blanking the whole app during the demo.
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen center">
        <h1 className="display small">Something went wrong on this screen</h1>
        <p className="muted small">{this.state.error.message}</p>
        <button className="btn primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
