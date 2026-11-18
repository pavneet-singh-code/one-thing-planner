import { useState } from 'react';
import { api, type Task } from '../api';
import { fmtDay, fmtTime, fromLocalInput, today, toLocalInput } from '../dates';
import { TODAY_LIMIT, toast, type Store } from '../store';
import { FocusTimer } from './FocusTimer';

export function Chips({ t }: { t: Task }) {
  const td = today();
  return (
    <div className="meta">
      {t.subject && <span className="chip">{t.subject}</span>}
      {t.due && (
        <span className={'chip' + (t.due < td ? ' due-over' : t.due === td ? ' due-today' : '')}>
          {t.due < td ? `overdue · ${fmtDay(t.due)}` : t.due === td ? 'due today' : `due ${fmtDay(t.due)}`}
        </span>
      )}
      <span className="chip">{t.est} min</span>
      {t.remindAt && t.status !== 'done' && <span className="chip rem">⏰ {fmtTime(t.remindAt)}</span>}
    </div>
  );
}

export function NowCard({ store, ai, goTo }: { store: Store; ai: boolean; goTo: (tab: string) => void }) {
  const now = store.todays[0];
  const { actions } = store;
  const [busy, setBusy] = useState(false);
  const [editRem, setEditRem] = useState(false);

  if (!now) {
    const any = store.tasks.length > 0;
    return (
      <section className="now" aria-label="Now">
        <div className="label">Now · your one thing</div>
        <p className="muted" style={{ margin: 0 }}>
          {any ? 'Nothing picked for today. Choose one task from Later, or let the AI pick today’s three.'
               : 'No tasks yet. Add your first one, or describe a goal and let the AI break it into steps.'}
        </p>
        <div className="actions">
          <button className="primary" onClick={() => goTo(any ? 'later' : 'add')}>{any ? 'Pick from Later' : 'Add a task'}</button>
          {ai && <button onClick={() => goTo('ai')}>{any ? 'Plan my day' : 'Plan a goal'}</button>}
        </div>
      </section>
    );
  }

  const breakDown = async () => {
    setBusy(true);
    try {
      const { steps } = await api.breakDown(now.id);
      actions.setSteps(now, steps.map((text) => ({ text, done: false })));
      toast('Steps added. Just do the first one.');
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="now" aria-label="Now">
      <div className="label">Now · your one thing</div>
      <div className="now-title"><span>{now.title}</span></div>
      <Chips t={now} />
      <FocusTimer taskId={now.id} taskTitle={now.title} onFocusDone={(m) => actions.logFocus(m)} />
      <div className="actions">
        <button onClick={() => actions.complete(now)}>✓ Done</button>
        {ai && <button className="ghost" disabled={busy} onClick={breakDown}>{busy ? 'Thinking…' : 'Stuck? Break it down'}</button>}
        {store.todays.length > 1 && <button className="ghost" onClick={actions.skip}>Do another first</button>}
        <button className="ghost" onClick={() => setEditRem((v) => !v)}>{now.remindAt ? 'Change reminder' : 'Set reminder'}</button>
      </div>
      {editRem && <ReminderEditor t={now} onSave={(iso) => { actions.setReminder(now, iso); setEditRem(false); }} />}
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
    </section>
  );
}

function ReminderEditor({ t, onSave }: { t: Task; onSave: (iso: string | null) => void }) {
  const [v, setV] = useState(toLocalInput(t.remindAt));
  return (
    <div className="inline-form">
      <label className="f">Remind me at<input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <div className="actions">
        <button className="primary" onClick={() => onSave(fromLocalInput(v))}>Save</button>
        {t.remindAt && <button className="ghost" onClick={() => onSave(null)}>Remove</button>}
      </div>
    </div>
  );
}

export function TodayList({ store, goTo }: { store: Store; goTo: (tab: string) => void }) {
  const { todays, actions } = store;
  return (
    <section className="stack-8" aria-labelledby="todayLbl">
      <div className="section-head">
        <h2 id="todayLbl">Today’s three</h2>
        <span className="muted small">Finish one before adding another.</span>
      </div>
      <div className="list">
        {Array.from({ length: TODAY_LIMIT }, (_, i) => {
          const t = todays[i];
          if (!t) return (
            <div className="row placeholder" key={'empty' + i}>
              <div className="slot">{i + 1}</div>
              <div className="main"><div className="t">Empty slot</div></div>
              <button className="ghost" onClick={() => goTo('later')}>Pick</button>
            </div>
          );
          return (
            <div className="row" key={t.id}>
              <button className="check" aria-label={`Mark "${t.title}" done`} title="Mark done" onClick={() => actions.complete(t)} />
              <div className="main"><div className="t">{i === 0 ? '▶ ' : ''}{t.title}</div><Chips t={t} /></div>
              <div className="btns">
                {i > 0 && <button className="ghost" onClick={() => actions.makeNow(t)}>Now</button>}
                <button className="ghost" onClick={() => actions.park(t)}>Later</button>
              </div>
            </div>
          );
        })}
        {todays.slice(TODAY_LIMIT).map((t) => (
          <div className="row" key={t.id}>
            <div className="slot">+</div>
            <div className="main"><div className="t">{t.title}</div><div className="meta">Over the limit</div></div>
            <button className="ghost" onClick={() => actions.park(t)}>Later</button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LaterPanel({ store }: { store: Store }) {
  const { laters, dones, actions } = store;
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="panel">
      <div className="list">
        {laters.length === 0 && (
          <div className="row placeholder"><div /><div className="main"><div className="t">Nothing parked. New tasks land here.</div></div><div /></div>
        )}
        {laters.map((t) => (
          <div className="row" key={t.id}>
            <button className="check" aria-label={`Mark "${t.title}" done`} title="Mark done" onClick={() => actions.complete(t)} />
            <div className="main"><div className="t">{t.title}</div><Chips t={t} /></div>
            <div className="btns">
              <button className="ghost" onClick={() => actions.moveToday(t)}>→ Today</button>
              {confirm === t.id
                ? <button className="ghost danger" onClick={() => { actions.remove(t); setConfirm(null); }}>Delete?</button>
                : <button className="ghost" aria-label={`Delete "${t.title}"`} onClick={() => setConfirm(t.id)}>✕</button>}
            </div>
          </div>
        ))}
      </div>
      <details>
        <summary className="muted">Done ({dones.length})</summary>
        <div className="list" style={{ marginTop: 8 }}>
          {dones.slice(0, 60).map((t) => (
            <div className="row" key={t.id}>
              <div className="slot">✓</div>
              <div className="main"><div className="t struck">{t.title}</div></div>
              <div className="btns">
                <button className="ghost" onClick={() => actions.reopen(t)}>Undo</button>
                <button className="ghost" aria-label="Delete" onClick={() => actions.remove(t)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function AddTask({ store }: { store: Store }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [due, setDue] = useState('');
  const [est, setEst] = useState(30);
  const [rem, setRem] = useState('');
  const [where, setWhere] = useState<'later' | 'today'>('later');
  const subjects = [...new Set(store.tasks.map((t) => t.subject).filter(Boolean))];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const [t] = await store.actions.add([{ title: title.trim(), subject: subject.trim(), due: due || null, est, remindAt: fromLocalInput(rem), wantToday: where === 'today' }]);
    toast(t.status === 'today' ? 'Added to today.' : where === 'today' ? 'Today is full, so it went to Later.' : 'Added to Later.');
    setTitle(''); setRem('');
  };

  return (
    <div className="panel">
      <form className="card" onSubmit={submit}>
        <div className="grid">
          <label className="f full">What do you need to do?
            <input id="fTitle" required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solve 15 integration problems from Ch. 7" />
          </label>
          <label className="f wide">Subject
            <input id="fSubject" maxLength={40} list="subjList" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Maths" />
          </label>
          <label className="f">Due date<input id="fDue" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <label className="f">Minutes<input id="fEst" type="number" min={5} max={600} step={5} value={est} onChange={(e) => setEst(Number(e.target.value) || 30)} /></label>
          <label className="f wide">Remind me at<input id="fRem" type="datetime-local" value={rem} onChange={(e) => setRem(e.target.value)} /></label>
          <label className="f wide">Put it in
            <select id="fWhere" value={where} onChange={(e) => setWhere(e.target.value as 'later' | 'today')}>
              <option value="later">Later</option>
              <option value="today">Today (if a slot is free)</option>
            </select>
          </label>
        </div>
        <datalist id="subjList">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="actions"><button className="primary" type="submit">Add task</button></div>
      </form>
    </div>
  );
}
