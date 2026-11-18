import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
import { initTheme } from './theme';

/** If anything in the app crashes, show what happened and a way out instead of a blank screen. */
class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[app crash]', error); }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="gate">
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="muted" style={{ margin: 0 }}>Your tasks are safe on the server. Try reloading. If that doesn’t help, reset the app (it clears only the offline copy on this phone).</p>
          <pre className="crash">{String(e.message || e).slice(0, 400)}</pre>
          <div className="actions">
            <button className="primary" onClick={() => location.reload()}>Reload</button>
            <button className="soft" onClick={() => location.assign('/?reset')}>Reset app</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Send a screenshot of this screen if it keeps happening.</p>
        </div>
      </div>
    );
  }
}

initTheme();
registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(<StrictMode><Crash><App /></Crash></StrictMode>);
