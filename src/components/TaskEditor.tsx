import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Kind, Repeat, Step, Task } from '../api';
import { fromLocalInput, toLocalInput } from '../dates';
import { TODAY_LIMIT, toast, type Store } from '../store';
import { KINDS, REPEATS } from '../kinds';
import { Icon } from './Icon';
import { RevisePicker } from './Tasks';

/** What to open: an existing task, or a new one with some fields pre-filled. */
export type EditRequest = { task: Task } | { preset: { due?: string | null; title?: string; wantToday?: boolean; subject?: string; kind?: Kind } };
export const EditContext = createContext<(r: EditRequest) => void>(() => {});
export const useEditor = () => useContext(EditContext);

export function TaskEditor({ store, req, onClose }: { store: Store; req: EditRequest; onClose: () => void }) {
  const existing = 'task' in req ? store.tasks.find((t) => t.id === req.task.id) ?? req.task : null;
  const preset = 'preset' in req ? req.preset : {};
  const ref = useRef<HTMLDialogElement>(null);

  const [title, setTitle] = useState(existing?.title ?? preset.title ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? preset.subject ?? '');
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

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const allSteps = () => (newStep.trim() ? [...steps, { text: newStep.trim(), done: false }] : steps).filter((s) => s.text.trim());

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) { toast('Links must start with http:// or https://'); return; }
    if (repeat && !due) { toast('Pick a due date for a repeating task.'); return; }
    const fields = { kind, link: link.trim(), repeat, title: title.trim(), subject: subject.trim(), due: due || null, est, remindAt: fromLocalInput(rem), notes: notes.trim(), steps: allSteps() };
    if (existing) {
      store.actions.edit(existing, fields);
      toast('Saved.');
    } else {
      const [t] = await store.actions.add([{ ...fields, wantToday: where === 'today' }]);
      if (fields.steps.length) store.actions.setSteps(t, fields.steps);
      toast(t.status === 'today' ? 'Added to today.' : where === 'today' ? 'Today is full, so it went to Later.' : 'Added to Later.');
    }
    onClose();
  };

  const act = (fn: () => void) => { fn(); onClose(); };
  const todayFull = store.todays.length >= TODAY_LIMIT;

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={save} className="sheet-body">
        <div className="sheet-head">
          <h2>{existing ? 'Edit task' : 'New task'}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}><Icon name="x" /></button>
        </div>

        <label className="f">Task
          <input required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solve 20 percentage problems from PDF 1" autoFocus={!existing} />
        </label>
        <div className="f"><span>Type</span>
          <div className="seg">
            {KINDS.map((k) => <button type="button" key={k.id} title={k.hint} className={kind === k.id ? 'on' + (k.id !== 'study' ? ' k-' + k.id : '') : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>
        </div>
        <div className="grid">
          <label className="f wide">Subject
            <input maxLength={40} list="subjList" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="NALR" />
          </label>
          <label className="f wide">Due date<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          <label className="f wide">Minutes
            <div className="seg">
              {[15, 30, 45, 60, 90].map((m) => (
                <button type="button" key={m} className={est === m ? 'on' : ''} onClick={() => setEst(m)}>{m}</button>
              ))}
              <input aria-label="Custom minutes" type="number" min={5} max={600} step={5} value={est} onChange={(e) => setEst(Number(e.target.value) || 30)} />
            </div>
          </label>
          <label className="f wide">Remind me at<input type="datetime-local" value={rem} onChange={(e) => setRem(e.target.value)} /></label>
          <label className="f wide">Repeat
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              {REPEATS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className="f wide">Link <span className="muted" style={{ fontWeight: 400 }}>(test, meeting, form)</span>
            <input type="url" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          </label>
        </div>
        <datalist id="subjList">{subjects.map((s) => <option key={s} value={s} />)}</datalist>

        <label className="f">Notes
          <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Which PDF, page numbers, formulas to remember…" />
        </label>

        <div className="f">
          <span>Steps</span>
          <ul className="steps edit">
            {steps.map((s, i) => (
              <li key={i}>
                <input type="checkbox" aria-label="Step done" checked={s.done} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                <input className="bare" maxLength={160} value={s.text} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button type="button" className="icon-btn" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
              </li>
            ))}
            <li>
              <Icon name="plus" size={16} className="muted" />
              <input className="bare" maxLength={160} value={newStep} placeholder="Add a step and press Enter"
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newStep.trim()) { setSteps([...steps, { text: newStep.trim(), done: false }]); setNewStep(''); } } }} />
            </li>
          </ul>
        </div>

        {existing?.status === 'done' && (
          <div className="f"><span>Revise this</span><div><RevisePicker t={existing} store={store} /></div></div>
        )}

        {!existing && (
          <div className="f"><span>Put it in</span>
            <div className="seg">
              <button type="button" className={where === 'later' ? 'on' : ''} onClick={() => setWhere('later')}>Later</button>
              <button type="button" className={where === 'today' ? 'on' : ''} onClick={() => setWhere('today')} disabled={todayFull} title={todayFull ? 'Today already has three' : ''}>Today</button>
            </div>
          </div>
        )}

        <div className="sheet-foot">
          {existing && (
            <div className="actions">
              {existing.status !== 'done' && <button type="button" className="soft" onClick={() => act(() => store.actions.complete(existing))}><Icon name="check" size={16} /> Done</button>}
              {existing.status === 'later' && <button type="button" className="soft" onClick={() => act(() => store.actions.moveToday(existing))}>Move to today</button>}
              {existing.status === 'today' && <button type="button" className="soft" onClick={() => act(() => store.actions.park(existing))}>Move to Later</button>}
              {existing.status === 'done' && <button type="button" className="soft" onClick={() => act(() => store.actions.reopen(existing))}>Reopen</button>}
              {confirmDel
                ? <button type="button" className="soft danger" onClick={() => act(() => store.actions.remove(existing))}>Delete for good?</button>
                : <button type="button" className="icon-btn danger" aria-label="Delete task" onClick={() => setConfirmDel(true)}><Icon name="trash" /></button>}
            </div>
          )}
          <button className="primary" type="submit" disabled={!title.trim()}>{existing ? 'Save changes' : 'Add task'}</button>
        </div>
      </form>
    </dialog>
  );
}
