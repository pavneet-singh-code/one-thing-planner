import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Kind, Repeat, Step, Task } from '../api';
import { fmtDay, fmtTime, fromLocalInput, toLocalInput } from '../dates';
import { KINDS, kindLabel, repeatLabel } from '../kinds';
import { TODAY_LIMIT, toast, type Store } from '../store';
import { subjectClass } from '../subjects';
import { Icon } from './Icon';
import { RepeatPicker } from './RepeatPicker';
import { RevisePicker } from './Tasks';

/** What to open: an existing task (its own page), or a new one with some fields pre-filled. */
export type EditRequest = { task: Task } | { preset: { due?: string | null; title?: string; wantToday?: boolean; subject?: string; folder?: string; kind?: Kind } };
export const EditContext = createContext<(r: EditRequest) => void>(() => {});
export const useEditor = () => useContext(EditContext);

export function TaskEditor({ store, req, onClose }: { store: Store; req: EditRequest; onClose: () => void }) {
  const existing = 'task' in req ? store.tasks.find((t) => t.id === req.task.id) ?? req.task : null;
  const preset = 'preset' in req ? req.preset : {};
  const ref = useRef<HTMLDialogElement>(null);

  const [title, setTitle] = useState(existing?.title ?? preset.title ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? preset.subject ?? '');
  const [folder, setFolder] = useState(existing?.folder ?? preset.folder ?? '');
  const [kind, setKind] = useState<Kind>(existing?.kind ?? preset.kind ?? 'study');
  const [link, setLink] = useState(existing?.link ?? '');
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? '');
  const [due, setDue] = useState(existing?.due ?? preset.due ?? '');
  const [est, setEst] = useState(existing?.est ?? 30);
  const [rem, setRem] = useState(toLocalInput(existing?.remindAt ?? null));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [steps, setSteps] = useState<Step[]>(existing?.steps ?? []);
  const [newStep, setNewStep] = useState('');
  const [where, setWhere] = useState<'later' | 'today'>(preset.wantToday ? 'today' : 'later');
  const [confirmDel, setConfirmDel] = useState(false);
  const subjects = [...new Set([...store.subjects.map((s) => s.name), ...store.tasks.map((t) => t.subject)].filter(Boolean))];
  const folders = [...new Set(store.tasks.filter((t) => t.subject === subject.trim() && t.folder).map((t) => t.folder))];

  const allSteps = () => (newStep.trim() ? [...steps, { text: newStep.trim(), done: false }] : steps).filter((s) => s.text.trim());
  const fields = () => ({ kind, link: link.trim(), repeat, title: title.trim(), subject: subject.trim(), folder: folder.trim(), due: due || null, est, remindAt: fromLocalInput(rem), notes: notes.trim(), steps: allSteps() });
  const problem = () => {
    if (!title.trim()) return 'The task needs a name.';
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) return 'Links must start with http:// or https://';
    if (repeat && !due) return 'Pick a due date for a repeating task.';
    return '';
  };

  // Closing goes through the browser history, so the phone's back button closes the page too.
  const skipSave = useRef(false);
  const latest = useRef({ fields, problem, existing });
  latest.current = { fields, problem, existing };
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    history.pushState({ otSheet: true }, '');
    const onPop = () => {
      const { fields: f, problem: p, existing: ex } = latest.current;
      if (ex && !skipSave.current) {
        const err = p();
        if (err) { toast(err); history.pushState({ otSheet: true }, ''); return; } // stay open
        const before = JSON.stringify(pick(ex)), after = JSON.stringify(pick({ ...ex, ...f() } as Task));
        if (before !== after) { store.actions.edit(ex, f()); toast('Saved.'); }
      }
      onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => history.back();
  const act = (fn: () => void, save = true) => { if (!save) skipSave.current = true; fn(); close(); };

  const addNew = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = problem();
    if (err) { toast(err); return; }
    const f = fields();
    const [t] = await store.actions.add([{ ...f, wantToday: where === 'today' }]);
    if (f.steps.length) store.actions.setSteps(t, f.steps);
    toast(t.status === 'today' ? 'Added to today.' : where === 'today' ? 'Today is full, so it went to Later.' : 'Added to Later.');
    skipSave.current = true;
    close();
  };

  const todayFull = store.todays.length >= TODAY_LIMIT;

  /* shared field blocks */
  const typeField = (
    <div className="f"><span>Type</span>
      <div className="seg">
        {KINDS.map((k) => <button type="button" key={k.id} title={k.hint} className={kind === k.id ? 'on' + (k.id !== 'study' ? ' k-' + k.id : '') : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
    </div>
  );
  const details = (
    <div className="grid">
      <label className="f wide">Subject
        <input maxLength={40} list="subjList" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. DNN" />
      </label>
      <label className="f wide">Folder <span className="muted" style={{ fontWeight: 400 }}>(which plan inside the subject)</span>
        <input maxLength={60} list="folderList" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Viva, Exam prep" />
      </label>
      <label className="f wide">Due date<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      <label className="f wide">Remind me at<input type="datetime-local" value={rem} onChange={(e) => setRem(e.target.value)} /></label>
      <label className="f full">Minutes
        <div className="seg">
          {[15, 30, 45, 60, 90].map((m) => <button type="button" key={m} className={est === m ? 'on' : ''} onClick={() => setEst(m)}>{m}</button>)}
          <input aria-label="Custom minutes" type="number" min={5} max={600} step={5} value={est} onChange={(e) => setEst(Number(e.target.value) || 30)} />
        </div>
      </label>
      <div className="f full"><span>Repeat</span><RepeatPicker value={repeat} onChange={setRepeat} /></div>
      <datalist id="subjList">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="folderList">{folders.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
  const linkField = (
    <div className="link-field">
      <input type="url" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (test, meeting, form, video, drive file)" aria-label="Link" />
      {/^https?:\/\//i.test(link.trim()) && <a className="primary-link" href={link.trim()} target="_blank" rel="noreferrer"><Icon name="link" size={16} /> Open</a>}
    </div>
  );
  const notesField = <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Which PDF, page numbers, formulas to remember, questions for the viva…" aria-label="Notes" />;
  const stepsField = (
    <ul className="steps edit">
      {steps.map((s, i) => (
        <li key={i} className={s.done ? 'd' : ''}>
          <input type="checkbox" aria-label="Step done" checked={s.done} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
          <input className="bare" maxLength={160} value={s.text} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <button type="button" className="icon-btn" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
        </li>
      ))}
      <li>
        <Icon name="plus" size={16} className="muted" />
        <input className="bare" maxLength={160} value={newStep} placeholder="Add a step and press Enter" onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newStep.trim()) { setSteps([...steps, { text: newStep.trim(), done: false }]); setNewStep(''); } } }} />
      </li>
    </ul>
  );

  /* ---------- new task: compact sheet ---------- */
  if (!existing) {
    return (
      <dialog ref={ref} className="sheet" onCancel={(e) => { e.preventDefault(); skipSave.current = true; close(); }} onClick={(e) => { if (e.target === ref.current) { skipSave.current = true; close(); } }}>
        <form onSubmit={addNew} className="sheet-body">
          <div className="sheet-head">
            <h2>New task</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => { skipSave.current = true; close(); }}><Icon name="x" /></button>
          </div>
          <label className="f">Task
            <input required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solve 20 percentage problems from PDF 1" autoFocus />
          </label>
          {typeField}
          {details}
          <div className="f"><span>Link</span>{linkField}</div>
          <label className="f">Notes{notesField}</label>
          <div className="f"><span>Steps</span>{stepsField}</div>
          <div className="f"><span>Put it in</span>
            <div className="seg">
              <button type="button" className={where === 'later' ? 'on' : ''} onClick={() => setWhere('later')}>Later</button>
              <button type="button" className={where === 'today' ? 'on' : ''} onClick={() => setWhere('today')} disabled={todayFull} title={todayFull ? 'Today already has three' : ''}>Today</button>
            </div>
          </div>
          <div className="sheet-foot"><button className="primary" type="submit" disabled={!title.trim()}>Add task</button></div>
        </form>
      </dialog>
    );
  }

  /* ---------- existing task: its own page ---------- */
  const t = existing;
  const stepsDone = steps.filter((s) => s.done).length;
  const statusLabel = t.status === 'done' ? `Done${t.doneAt ? ' · ' + fmtDay(t.doneAt.slice(0, 10)) : ''}` : t.status === 'today' ? (store.todays[0]?.id === t.id ? 'Now' : 'Today') : 'Later';
  return (
    <dialog ref={ref} className="sheet task-page" onCancel={(e) => { e.preventDefault(); close(); }}>
      <div className="tp">
        <header className="tp-bar">
          <button type="button" className="icon-btn" aria-label="Back" onClick={close}><Icon name="left" size={22} /></button>
          <div className="crumbs">
            {subject.trim() ? <span className={'tag ' + subjectClass(subject.trim())}>{subject.trim()}</span> : <span className="muted small">No subject</span>}
            {folder.trim() && <><Icon name="right" size={12} className="muted" /><span className="folder-chip"><Icon name="folder" size={13} />{folder.trim()}</span></>}
          </div>
          {confirmDel
            ? <button type="button" className="soft sm danger" onClick={() => act(() => store.actions.remove(t), false)}>Delete for good?</button>
            : <button type="button" className="icon-btn danger" aria-label="Delete task" onClick={() => setConfirmDel(true)}><Icon name="trash" /></button>}
        </header>

        <div className="tp-body">
          <section className={'tp-hero ' + (kind !== 'study' ? 'k-' + kind : subjectClass(subject.trim()))}>
            <div className="tp-tags">
              <span className={'status-chip s-' + t.status}>{statusLabel}</span>
              {kind !== 'study' && <span className={'tag k-' + kind}>{kindLabel(kind)}</span>}
              {repeat && <span className="chip"><Icon name="repeat" size={13} />{repeatLabel(repeat, due || null)}</span>}
            </div>
            <textarea className="tp-title" rows={2} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} aria-label="Task name" />
            <div className="meta">
              {due && <span className="chip"><Icon name="calendar" size={13} />{fmtDay(due)}</span>}
              <span className="chip"><Icon name="clock" size={13} />{est} min</span>
              {rem && <span className="chip"><Icon name="bell" size={13} />{fmtTime(new Date(rem).toISOString())}</span>}
              {steps.length > 0 && <span className="chip">{stepsDone}/{steps.length} steps</span>}
            </div>
            <div className="actions">
              {t.status !== 'done' && <button type="button" className="primary" onClick={() => act(() => store.actions.complete(t))}><Icon name="check" size={16} /> Done</button>}
              {t.status !== 'done' && store.todays[0]?.id !== t.id && <button type="button" className="soft" onClick={() => act(() => store.actions.makeNow(t))}><Icon name="play" size={14} /> Do it now</button>}
              {t.status === 'later' && <button type="button" className="soft" onClick={() => act(() => store.actions.moveToday(t))}>Move to today</button>}
              {t.status === 'today' && <button type="button" className="soft" onClick={() => act(() => store.actions.park(t))}>Move to Later</button>}
              {t.status === 'done' && <button type="button" className="soft" onClick={() => act(() => store.actions.reopen(t))}>Reopen</button>}
              {/^https?:\/\//i.test(link.trim()) && <a className="soft-link" href={link.trim()} target="_blank" rel="noreferrer"><Icon name="link" size={15} /> Open link</a>}
            </div>
          </section>

          <section className="tp-card">
            <h3><Icon name="link" size={16} /> Link</h3>
            {linkField}
          </section>

          <section className="tp-card">
            <h3><Icon name="edit" size={16} /> Notes</h3>
            {notesField}
          </section>

          <section className="tp-card">
            <div className="section-head"><h3><Icon name="list" size={16} /> Steps</h3>{steps.length > 0 && <span className="muted small">{stepsDone}/{steps.length}</span>}</div>
            {steps.length > 0 && <div className="track"><div style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>}
            {stepsField}
          </section>

          <section className="tp-card">
            <h3><Icon name="settings" size={16} /> Details</h3>
            {typeField}
            {details}
          </section>

          {t.status === 'done' && (
            <section className="tp-card">
              <h3><Icon name="repeat" size={16} /> Revise this</h3>
              <div><RevisePicker t={t} store={store} /></div>
            </section>
          )}
          <p className="muted small tp-foot">Added {fmtDay(t.createdAt.slice(0, 10))}. Changes save when you go back.</p>
        </div>
      </div>
    </dialog>
  );
}

const pick = (t: Task) => ({ title: t.title, subject: t.subject, folder: t.folder, kind: t.kind, link: t.link, repeat: t.repeat, due: t.due, est: t.est, remindAt: t.remindAt ? new Date(t.remindAt).toISOString().slice(0, 16) : null, notes: t.notes, steps: t.steps });
