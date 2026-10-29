import { Component, type ReactNode } from 'react';

/** A screen's code file from an older deploy is gone (the tab was open while a new version went live). */
export const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i;

/** Reload once to the new version; a second failure within a minute shows the error instead of looping. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem('dishaara.reloadedAt') || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('dishaara.reloadedAt', String(Date.now()));
  } catch {
    /* storage blocked: reload anyway, once per page */
  }
  location.reload();
  return true;
}

// Keeps one broken screen from blanking the whole app during the demo.
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (STALE.test(error.message)) reloadForNewVersion();
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (STALE.test(this.state.error.message))
      return (
        <div className="screen center">
          <h1 className="display small">A new version of Dishaara is ready</h1>
          <button className="btn primary" onClick={() => location.reload()}>Load it</button>
        </div>
      );
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
