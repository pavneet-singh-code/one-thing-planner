import { useEffect, useState } from 'react';
import { addDays, today, ymd } from './dates';
import { useStore, useToast } from './store';
import { AddTask, LaterPanel, NowCard, TodayList } from './components/Tasks';
import { AiPanel, KeyGate, SettingsPanel, WeekPanel } from './components/Panels';

const TABS = [
  { id: 'add', label: 'Add' },
  { id: 'later', label: 'Later' },
  { id: 'week', label: 'Week' },
  { id: 'ai', label: 'AI plan' },
  { id: 'settings', label: 'Settings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const store = useStore();
  const toastMsg = useToast();
  const [tab, setTabState] = useState<Tab>(() => {
    try { return (localStorage.getItem('onething.tab') as Tab) || 'add'; } catch { return 'add'; }
  });
  const setTab = (t: string) => {
    setTabState(t as Tab);
    try { localStorage.setItem('onething.tab', t); } catch { /* ignore */ }
  };

  // Opened from a reminder notification: make that task the "now" task.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('focus');
    if (!id || !store.state) return;
    const t = store.tasks.find((x) => x.id === id);
    if (t && t.status !== 'done' && store.todays[0]?.id !== id) store.actions.makeNow(t);
    history.replaceState(null, '', '/');
  }, [store.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (store.error?.status === 401) return <KeyGate onUnlock={store.load} error={store.error.message} />;

  if (!store.state) return (
    <div className="wrap">
      {store.error ? (
        <div className="card"><h2>Can’t load your planner</h2><p className="muted">{store.error.message}</p>
          <div className="actions"><button className="primary" onClick={store.load}>Try again</button></div></div>
      ) : <p className="muted">Loading…</p>}
    </div>
  );

  const d = today();
  const doneToday = store.dones.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === d).length;
  const focusToday = store.state.focus.find((f) => f.day === d)?.minutes ?? 0;
  const doneDays = new Set(store.dones.filter((t) => t.doneAt).map((t) => ymd(new Date(t.doneAt!))));
  let streak = 0;
  for (let day = doneDays.has(d) ? d : addDays(d, -1); doneDays.has(day); day = addDays(day, -1)) streak++;

  return (
    <div className="wrap">
      <header>
        <div>
          <div className="label">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>One <span className="hl">Thing</span> at a time</h1>
        </div>
        <div className="stats">
          <div className="stat"><b>{doneToday}/{doneToday + store.todays.length}</b><span>done today</span></div>
          <div className="stat"><b>{focusToday}</b><span>min focused</span></div>
          <div className="stat"><b>{streak}</b><span>day streak</span></div>
        </div>
      </header>

      <NowCard store={store} ai={store.state.ai} goTo={setTab} />
      <TodayList store={store} goTo={setTab} />

      <section>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'later' && store.laters.length ? <span className="muted"> ({store.laters.length})</span> : null}
            </button>
          ))}
        </div>
        {tab === 'add' && <AddTask store={store} />}
        {tab === 'later' && <LaterPanel store={store} />}
        {tab === 'week' && <WeekPanel store={store} />}
        {tab === 'ai' && <AiPanel store={store} />}
        {tab === 'settings' && <SettingsPanel store={store} />}
      </section>

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
