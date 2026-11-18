import { useMemo, useState } from 'react';
import { api, type Task } from '../api';
import { addDays, fmtShort, fmtTime, greeting, today, weekday, ymd } from '../dates';
import { useDrag } from '../drag';
import { kindLabel } from '../kinds';
import { getName, TODAY_LIMIT, toast, type Store } from '../store';
import { subjectClass } from '../subjects';
import { FocusTimer } from './FocusTimer';
import { HeroArt, Sprig } from './Hero';
import { Icon } from './Icon';
import { useEditor } from './TaskEditor';

/* ---------- shared bits ---------- */
export function Chips({ t }: { t: Task }) {
  const td = today();
  return (
    <div className="meta">
      {t.kind && t.kind !== 'study' && <span className={'tag k-' + t.kind}>{kindLabel(t.kind)}</span>}
      {t.subject && <span className={'tag ' + subjectClass(t.subject)}>{t.subject}</span>}
      {t.due && (
        <span className={'chip' + (t.status !== 'done' && t.due < td ? ' due-over' : t.due === td ? ' due-today' : '')}>
          <Icon name="calendar" size={13} />
          {t.status !== 'done' && t.due < td ? `Overdue · ${fmtShort(t.due)}` : t.due === td ? 'Today' : t.due === addDays(td, 1) ? 'Tomorrow' : fmtShort(t.due)}
        </span>
      )}
      <span className="chip"><Icon name="clock" size={13} />{t.est} min</span>
      {t.remindAt && t.status !== 'done' && <span className="chip"><Icon name="bell" size={13} />{fmtTime(t.remindAt)}</span>}
      {t.steps.length > 0 && <span className="chip">{t.steps.filter((s) => s.done).length}/{t.steps.length} steps</span>}
      {t.repeat && <span className="chip"><Icon name="repeat" size={13} />{t.repeat}</span>}
      {t.link && <a className="chip linkchip" href={t.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="link" size={13} />Open link</a>}
    </div>
  );
}

export function TaskRow({ t, store, lead, extra }: { t: Task; store: Store; lead?: React.ReactNode; extra?: React.ReactNode }) {
  const edit = useEditor();
  const done = t.status === 'done';
  return (
    <div className={'row' + (done ? ' is-done' : '')}>
      {lead ?? (
        <button className={'check' + (done ? ' on' : '')} aria-label={done ? `Reopen "${t.title}"` : `Mark "${t.title}" done`}
          onClick={() => (done ? store.actions.reopen(t) : store.actions.complete(t))}>{done && <Icon name="check" size={14} />}</button>
      )}
      <div className="main" role="button" tabIndex={0} onClick={() => edit({ task: t })} onKeyDown={(e) => { if (e.key === 'Enter') edit({ task: t }); }} aria-label={`Edit "${t.title}"`}>
        <span className="t">{t.title}</span>
        <Chips t={t} />
      </div>
      <div className="btns">{extra}</div>
    </div>
  );
}

/* ---------- Now (hero) ---------- */
export function NowHero({ store, ai, goTo }: { store: Store; ai: boolean; goTo: (tab: string) => void }) {
  const now = store.todays[0];
  const { actions } = store;
  const edit = useEditor();
  const [busy, setBusy] = useState(false);

  const breakDown = async () => {
    if (!now) return;
    setBusy(true);
    try {
      const { steps } = await api.breakDown(now.id);
      actions.setSteps(now, [...now.steps, ...steps.map((text) => ({ text, done: false }))]);
      toast('Steps added. Just do the first one.');
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="hero" aria-label="Now">
      <HeroArt />
      <div className="hero-card">
        <div className="label accent">Now · your one thing</div>
        {!now ? (
          <>
            <h2 className="now-title">{store.tasks.length ? 'Pick one thing to start.' : 'Add your first task.'}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {store.tasks.length ? 'Choose a task from your list, or let the AI pick today’s three.' : 'Type it in the box on this page, or describe a goal and let the AI plan it.'}
            </p>
            <div className="actions">
              <button className="primary" onClick={() => goTo(store.tasks.length ? 'tasks' : 'home')}>{store.tasks.length ? 'Pick from my tasks' : 'Add a task'}</button>
              {ai && <button className="soft" onClick={() => goTo('ai')}><Icon name="sparkle" size={16} /> Plan with AI</button>}
            </div>
          </>
        ) : (
          <>
            <button className="now-title link" onClick={() => edit({ task: now })} title="Edit">{now.title}</button>
            <Chips t={now} />
            <FocusTimer taskId={now.id} taskTitle={now.title} onFocusDone={(m) => actions.logFocus(m)} />
            {now.steps.length > 0 && (
              <ul className="steps">
                {now.steps.map((s, i) => (
                  <li key={i} className={s.done ? 'd' : ''}>
                    <input type="checkbox" id={`st-${i}`} checked={s.done}
                      onChange={(e) => actions.setSteps(now, now.steps.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                    <label htmlFor={`st-${i}`}>{s.text}</label>
                  </li>
                ))}
              </ul>
            )}
            <div className="actions">
              <button className="primary" onClick={() => actions.complete(now)}><Icon name="check" size={16} /> Done</button>
              {ai && <button className="soft" disabled={busy} onClick={breakDown}><Icon name="sparkle" size={16} />{busy ? 'Thinking…' : 'Break it down'}</button>}
              {store.todays.length > 1 && <button className="soft" onClick={actions.skip}>Do another first</button>}
              <button className="icon-btn" aria-label="Edit task" onClick={() => edit({ task: now })}><Icon name="edit" /></button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Greeting + quick add ---------- */
const WHEN = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'Next week' },
  { id: 'none', label: 'Someday' },
] as const;

export function Greeting({ store }: { store: Store }) {
  const edit = useEditor();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<(typeof WHEN)[number]['id'] | 'custom'>('today');
  const [custom, setCustom] = useState('');
  const name = getName();
  const td = today();
  const left = store.todays.length;

  const due = when === 'today' ? td : when === 'tomorrow' ? addDays(td, 1) : when === 'week' ? addDays(td, 7) : when === 'custom' ? custom || null : null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const [t] = await store.actions.add([{ title: title.trim(), due, wantToday: when === 'today' }]);
    toast(t.status === 'today' ? 'Added to today.' : when === 'today' ? 'Today is full, so it went to Later.' : 'Added.');
    setTitle('');
  };

  return (
    <section className="card greet">
      <Sprig />
      <h1>{greeting()}{name ? `, ${name}` : ''} <span aria-hidden="true">👋</span></h1>
      <p className="muted" style={{ margin: 0 }}>
        {left === 0 ? 'Nothing lined up for today yet.' : left === 1 ? 'One thing on today’s list. You’ve got this.' : `${left} things on today’s list. Start with the first.`}
      </p>
      <form className="quick" onSubmit={add}>
        <input aria-label="New task" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="I want to…" />
        <button type="button" className="icon-btn" aria-label="More options" title="More options"
          onClick={() => { edit({ preset: { title: title.trim(), due, wantToday: when === 'today' } }); setTitle(''); }}><Icon name="edit" /></button>
        <button className="round" type="submit" aria-label="Add task" disabled={!title.trim()}><Icon name="send" /></button>
      </form>
      <div className="pills">
        {WHEN.map((w) => <button key={w.id} type="button" className={'pill' + (when === w.id ? ' on' : '')} onClick={() => setWhen(w.id)}>{w.label}</button>)}
        <label className={'pill' + (when === 'custom' ? ' on' : '')}>
          <Icon name="calendar" size={14} />
          <input type="date" aria-label="Custom date" value={custom} onChange={(e) => { setCustom(e.target.value); setWhen('custom'); }} />
        </label>
      </div>
    </section>
  );
}

/* ---------- Today's three ---------- */
export function TodayList({ store, goTo }: { store: Store; goTo: (tab: string) => void }) {
  const { todays, actions } = store;
  const drag = useDrag((id, target) => {
    if (!target.startsWith('today:')) return;
    const to = Math.min(Number(target.slice(6)), todays.length - 1);
    const ids = todays.map((t) => t.id).filter((x) => x !== id);
    ids.splice(to, 0, id);
    actions.reorderToday(ids);
  });
  return (
    <section className="card" aria-labelledby="todayLbl">
      <div className="section-head">
        <h2 id="todayLbl">Today’s three</h2>
        <span className="muted small">{todays.length > 1 ? 'Hold the dots to drag into a new order.' : 'Finish one before adding another.'}</span>
      </div>
      <div className="list">
        {Array.from({ length: TODAY_LIMIT }, (_, i) => {
          const t = todays[i];
          if (!t) return (
            <div className="row placeholder" key={'empty' + i}>
              <span className="slot">{i + 1}</span>
              <span className="main"><span className="t">Empty slot</span></span>
              <div className="btns"><button className="soft sm" onClick={() => goTo('tasks')}>Pick</button></div>
            </div>
          );
          return (
            <div key={t.id} className="drag-row" data-drop={`today:${i}`}>
              {todays.length > 1 && <span className="grip" aria-hidden="true" {...drag(t.id)}><Icon name="grip" size={16} /></span>}
              <TaskRow t={t} store={store} extra={<>
                {i > 0 && <button className="soft sm" onClick={() => actions.makeNow(t)}>Now</button>}
                <button className="soft sm" onClick={() => actions.park(t)}>Later</button>
              </>} />
            </div>
          );
        })}
        {todays.slice(TODAY_LIMIT).map((t) => (
          <TaskRow key={t.id} t={t} store={store} extra={<button className="soft sm" onClick={() => actions.park(t)}>Later</button>} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Activity ---------- */
export function Activity({ store }: { store: Store }) {
  const td = today();
  const focus = store.state?.focus ?? [];
  const doneToday = store.dones.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === td).length;
  const doneDays = new Set(store.dones.filter((t) => t.doneAt).map((t) => ymd(new Date(t.doneAt!))));
  let streak = 0;
  for (let d = doneDays.has(td) ? td : addDays(td, -1); doneDays.has(d); d = addDays(d, -1)) streak++;
  const week = Array.from({ length: 7 }, (_, i) => addDays(td, i - 6)).map((d) => ({ d, m: focus.find((f) => f.day === d)?.minutes ?? 0 }));
  const max = Math.max(25, ...week.map((w) => w.m));
  const total = week.reduce((a, w) => a + w.m, 0);

  return (
    <section className="card">
      <h2>Activity</h2>
      <div className="tiles">
        <div className="tile"><Icon name="target" /><b>{doneToday}<small>/{doneToday + store.todays.length}</small></b><span>done today</span></div>
        <div className="tile"><Icon name="clock" /><b>{week[6].m}</b><span>min focused</span></div>
        <div className="tile"><Icon name="flame" /><b>{streak}</b><span>day streak</span></div>
      </div>
      <div className="bars" role="img" aria-label={`Focus minutes, last 7 days: ${total} total`}>
        {week.map((w) => (
          <div className={'bar' + (w.d === td ? ' today' : '')} key={w.d} title={`${w.m} min`}>
            <div className="bar-fill" style={{ height: `${Math.max(4, (w.m / max) * 100)}%` }} />
            <span>{weekday(w.d).slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ margin: 0 }}>{Math.floor(total / 60)}h {total % 60}m of focus in the last 7 days.</p>
    </section>
  );
}

/* ---------- Tasks page ---------- */
export function TasksPanel({ store }: { store: Store }) {
  const { todays, laters, dones, actions } = store;
  const edit = useEditor();
  const [q, setQ] = useState('');
  const [subj, setSubj] = useState('');
  const subjects = useMemo(() => [...new Set(store.tasks.map((t) => t.subject).filter(Boolean))].sort(), [store.tasks]);
  const match = (t: Task) => (!subj || t.subject === subj) && (!q || (t.title + ' ' + t.notes).toLowerCase().includes(q.toLowerCase()));

  const lt = laters.filter(match), tt = todays.filter(match), dt = dones.filter(match);
  const progress = subjects.map((s) => {
    const all = store.tasks.filter((t) => t.subject === s);
    return { s, done: all.filter((t) => t.status === 'done').length, total: all.length };
  });

  return (
    <div className="page">
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks and notes" aria-label="Search tasks" /></label>
        <button className="primary" onClick={() => edit({ preset: {} })}><Icon name="plus" size={16} /> New task</button>
      </div>
      {subjects.length > 0 && (
        <div className="pills">
          <button className={'pill' + (!subj ? ' on' : '')} onClick={() => setSubj('')}>All</button>
          {subjects.map((s) => <button key={s} className={'pill ' + (subj === s ? 'on' : '')} onClick={() => setSubj(subj === s ? '' : s)}><i className={'dot ' + subjectClass(s)} />{s}</button>)}
        </div>
      )}
      {progress.length > 0 && !q && (
        <div className="progress-grid">
          {progress.filter((p) => !subj || p.s === subj).map((p) => (
            <div className={'progress ' + subjectClass(p.s)} key={p.s}>
              <div className="progress-top"><b>{p.s}</b><span>{p.done}/{p.total}</span></div>
              <div className="track"><div style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <div className="section-head"><h2>Today</h2><span className="muted small">{todays.length}/{TODAY_LIMIT}</span></div>
        <div className="list">
          {tt.length ? tt.map((t) => <TaskRow key={t.id} t={t} store={store} extra={<button className="soft sm" onClick={() => actions.park(t)}>Later</button>} />)
            : <p className="empty">Nothing here.</p>}
        </div>
      </section>

      <section className="card">
        <div className="section-head"><h2>Later</h2><span className="muted small">{laters.length} parked</span></div>
        <div className="list">
          {lt.length ? lt.map((t) => <TaskRow key={t.id} t={t} store={store} extra={<button className="soft sm" onClick={() => actions.moveToday(t)}>Today</button>} />)
            : <p className="empty">{laters.length ? 'No matches.' : 'Nothing parked. New tasks land here.'}</p>}
        </div>
      </section>

      <details className="card">
        <summary><h2 style={{ display: 'inline' }}>Done</h2> <span className="muted small">({dones.length}) · tap Revise to schedule a revision</span></summary>
        <div className="list" style={{ marginTop: 10 }}>
          {dt.slice(0, 80).map((t) => <TaskRow key={t.id} t={t} store={store} extra={<RevisePicker t={t} store={store} />} />)}
          {!dt.length && <p className="empty">Nothing finished yet.</p>}
        </div>
      </details>
    </div>
  );
}

/* ---------- Revision scheduling for finished tasks ---------- */
const REVISE = [
  { label: 'Tomorrow', days: [1] },
  { label: 'In 3 days', days: [3] },
  { label: 'In a week', days: [7] },
  { label: '1 · 3 · 7 days', days: [1, 3, 7] },
];
export function RevisePicker({ t, store }: { t: Task; store: Store }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="soft sm" onClick={() => setOpen(true)}><Icon name="repeat" size={14} />Revise</button>;
  return (
    <div className="revise" role="group" aria-label="Schedule a revision">
      {REVISE.map((r) => <button key={r.label} className="soft sm" onClick={() => { store.actions.addRevisions(t, r.days); setOpen(false); }}>{r.label}</button>)}
      <button className="icon-btn" aria-label="Cancel" onClick={() => setOpen(false)}><Icon name="x" size={14} /></button>
    </div>
  );
}
