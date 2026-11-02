// Crash protection: a component that throws while rendering shows this panel instead of a blank app. The page-level
// boundary (App) keeps the sidebar working and resets when you navigate; the root boundary (main) is the last line.
// After a new deployment, pages of the old build can no longer be loaded – that case offers a reload.
import { Component } from 'react';
import { isStaleBuild, logError } from '../lib/errorLog';

interface Props { children: React.ReactNode; resetKey?: string; full?: boolean }
interface State { error: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error } }
  componentDidCatch(error: unknown) { if (!isStaleBuild(error)) logError(error, this.props.full ? 'app' : 'page') }
  componentDidUpdate(prev: Props) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isStaleBuild(this.state.error);
    return <div className={'crash' + (this.props.full ? ' crash-full' : '')} role="alert">
      <div className="crash-box">
        <h2>{stale ? 'A new version is available' : 'Something went wrong here'}</h2>
        <p className="muted">{stale ? 'SLATE·SPACE was updated while this page was open. Reload to continue – nothing is lost.'
          : 'This part of the page stopped working. Your data is safe. Try again, or reload the page; the problem has been noted.'}</p>
        <div className="crash-actions">
          {!stale && !this.props.full && <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>}
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
          {!this.props.full && !stale && <a className="btn" href="#home" onClick={() => this.setState({ error: null })}>Go to Home</a>}
        </div>
      </div>
    </div>;
  }
}
