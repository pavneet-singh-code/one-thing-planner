import { useEffect, useState } from 'react';
import { getName, useStore, useToast } from './store';
import { Activity, Greeting, NowHero, TasksPanel, TodayList } from './components/Tasks';
import { AiPanel, KeyGate, SettingsPanel } from './components/Panels';
import { CalendarPanel, Upcoming } from './components/Schedule';
import { HomeProgress, SubjectsPanel } from './components/Subjects';
import { EditContext, TaskEditor, type EditRequest } from './components/TaskEditor';
import { Icon, type IconName } from './components/Icon';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'subjects', label: 'Subjects', icon: 'book' },
  { id: 'ai', label: 'AI plan', icon: 'sparkle' },
];
const PAGES = [...TABS.map((t) => t.id), 'settings'];
const isTab = (t: string | null): t is string => !!t && PAGES.includes(t);

export default function App() {
  const store = useStore();
  const toastMsg = useToast();
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const [tab, setTabState] = useState(() => {
    try { const t = localStorage.getItem('onething.tab'); return isTab(t) ? t : 'home'; } catch { return 'home'; }
  });
  const setTab = (t: string) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
    try { localStorage.setItem('onething.tab', t); } catch { /* ignore */ }
  };

  // Opened from a reminder notification: make that task the "now" task.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('focus');
    if (!id || !store.state) return;
    const t = store.tasks.find((x) => x.id === id);
    if (t && t.status !== 'done' && store.todays[0]?.id !== id) store.actions.makeNow(t);
    setTab('home');
    history.replaceState(null, '', '/');
  }, [store.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (store.error?.status === 401) return <KeyGate onUnlock={store.load} error={store.error.message} />;

  if (!store.state) return (
    <div className="gate">
      {store.error ? (
        <div className="card"><h2>Can’t load your planner</h2><p className="muted">{store.error.message}</p>
          <div className="actions"><button className="primary" onClick={store.load}>Try again</button></div></div>
      ) : <div className="loader" aria-label="Loading" />}
    </div>
  );

  const ai = store.state.ai;
  const name = getName();

  return (
    <EditContext.Provider value={setEditing}>
      <DesktopModeBanner />
      <div className="shell">
        <header className="topbar">
          <button className="brand" onClick={() => setTab('home')}><span className="logo" aria-hidden="true">1</span>One Thing</button>
          <nav className="nav" aria-label="Main">
            {TABS.map((t) => (
              <button key={t.id} className={'nav-item' + (tab === t.id ? ' on' : '')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={17} /><span>{t.label}</span>
                {t.id === 'tasks' && store.laters.length > 0 && <em>{store.laters.length}</em>}
              </button>
            ))}
          </nav>
          <div className="top-right">
            <button className="round ghosted" aria-label="New task" onClick={() => setEditing({ preset: {} })}><Icon name="plus" /></button>
            <button className={'avatar' + (tab === 'settings' ? ' on' : '')} aria-label="Settings" title="Settings" onClick={() => setTab('settings')}>{(name || 'Me').slice(0, 1).toUpperCase()}</button>
          </div>
        </header>

        <main>
          {tab === 'home' && (
            <div className="home">
              <div className="col-main">
                <NowHero store={store} ai={ai} goTo={setTab} />
                <TodayList store={store} goTo={setTab} />
                <Upcoming store={store} goTo={setTab} />
              </div>
              <div className="col-side">
                <Greeting store={store} />
                <HomeProgress store={store} goTo={setTab} />
                <Activity store={store} />
              </div>
            </div>
          )}
          {tab === 'tasks' && <TasksPanel store={store} />}
          {tab === 'calendar' && <CalendarPanel store={store} goTo={setTab} />}
          {tab === 'subjects' && <SubjectsPanel store={store} />}
          {tab === 'ai' && <AiPanel store={store} />}
          {tab === 'settings' && <SettingsPanel store={store} />}
        </main>

        {editing && <TaskEditor key={'task' in editing ? editing.task.id : 'new'} store={store} req={editing} onClose={() => setEditing(null)} />}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </EditContext.Provider>
  );
}

/** Chrome's "Desktop site" on a phone squeezes the laptop layout onto the screen. Spot it and say how to turn it off. */
function DesktopModeBanner() {
  const [hidden, setHidden] = useState(false);
  const phoneInDesktopMode = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches
    && screen.width < 700 && window.innerWidth > screen.width * 1.4;
  if (!phoneInDesktopMode || hidden) return null;
  const scale = window.innerWidth / screen.width; // make the banner readable despite the zoom-out
  return (
    <div className="desk-banner" role="alert" style={{ fontSize: `${Math.round(15 * scale)}px` }}>
      <b>Chrome is showing the desktop version.</b>
      <span>Tap <b>⋮</b> (top right) and untick <b>Desktop site</b> to get the phone layout.</span>
      <button className="soft" style={{ fontSize: 'inherit', minHeight: 0, padding: '0.4em 1em' }} onClick={() => setHidden(true)}>OK</button>
    </div>
  );
}
