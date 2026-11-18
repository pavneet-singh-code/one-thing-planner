import { useState } from 'react';
import { api, type Kind, type Repeat, type Task } from '../api';
import { today, toLocalInput } from '../dates';
import { KINDS } from '../kinds';
import { toast, type Store } from '../store';
import { Icon } from './Icon';
import { RepeatPicker } from './RepeatPicker';

/** A task the AI proposed (or an existing task loaded for adjusting), with every option a normal task has. */
export type Proposal = {
  title: string; date: string; minutes: number; keep: boolean;
  kind: Kind; subject: string; time: string; repeat: Repeat; notes: string; link: string;
  srcId?: string; // set when this came from an existing task
};
export type Plan = { summary: string; tasks: Proposal[] };
type AiTask = { title: string; date: string; minutes: number; kind?: string };

export const keepers = (tasks: Proposal[]) => tasks.filter((t) => t.keep && t.title.trim());

export function fromAi(tasks: AiTask[], d: { subject?: string; time?: string } = {}): Proposal[] {
  return tasks.map((t) => ({
    title: t.title, date: t.date, minutes: t.minutes, keep: true,
    kind: (KINDS.some((k) => k.id === t.kind) ? t.kind : 'study') as Kind,
    subject: d.subject ?? '', time: d.time ?? '', repeat: '', notes: '', link: '',
  }));
}

export function fromTask(t: Task): Proposal {
  const local = toLocalInput(t.remindAt);
  return {
    title: t.title, date: t.due ?? '', minutes: t.est, keep: true, kind: t.kind, subject: t.subject,
    time: local ? local.slice(11, 16) : '', repeat: t.repeat, notes: t.notes, link: t.link, srcId: t.id,
  };
}

/** Fields for store.actions.add / edit */
export function toFields(p: Proposal) {
  return {
    title: p.title.trim(), subject: p.subject.trim(), due: p.date || null, est: p.minutes, kind: p.kind,
    notes: p.notes.trim(), link: p.link.trim(), repeat: p.date ? p.repeat : ('' as Repeat),
    remindAt: p.time && p.date ? new Date(`${p.date}T${p.time}`).toISOString() : null,
  };
}

const badLink = (ps: Proposal[]) => ps.find((p) => p.link.trim() && !/^https?:\/\//i.test(p.link.trim()));

/* ---------- one editable row ---------- */
function Row({ t, onChange, onRemove, subjects }: { t: Proposal; onChange: (p: Partial<Proposal>) => void; onRemove: () => void; subjects: string[] }) {
  const [more, setMore] = useState(false);
  const extras = [t.subject, t.time && `⏰ ${t.time}`, t.repeat && '↻', t.notes && 'notes', t.link && 'link'].filter(Boolean).join(' · ');
  return (
    <div className={'prop' + (t.keep ? '' : ' off') + (t.kind !== 'study' ? ' k-' + t.kind : '')}>
      <input type="checkbox" aria-label="Keep this task" checked={t.keep} onChange={(e) => onChange({ keep: e.target.checked })} />
      <div className="prop-fields">
        <input className="bare strong" aria-label="Task" maxLength={140} value={t.title} placeholder="Task" onChange={(e) => onChange({ title: e.target.value })} />
        <div className="prop-row">
          <input type="date" aria-label="Day" value={t.date} onChange={(e) => onChange({ date: e.target.value })} />
          <label className="mins"><input type="number" aria-label="Minutes" min={5} max={600} step={5} value={t.minutes} onChange={(e) => onChange({ minutes: Number(e.target.value) || 30 })} /> min</label>
          <select className="mini" aria-label="Type" value={t.kind} onChange={(e) => onChange({ kind: e.target.value as Kind })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <button type="button" className={'soft sm' + (more ? ' on' : '')} onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? 'Less' : 'More'}{!more && extras ? <span className="muted"> · {extras}</span> : null}
          </button>
        </div>
        {more && (
          <div className="prop-more">
            <label className="f">Subject<input maxLength={40} list="propSubj" value={t.subject} onChange={(e) => onChange({ subject: e.target.value })} placeholder="NALR" /></label>
            <label className="f">Reminder time<input type="time" value={t.time} onChange={(e) => onChange({ time: e.target.value })} /></label>
            <div className="f full"><span>Repeat</span><RepeatPicker value={t.repeat} onChange={(repeat) => onChange({ repeat })} /></div>
            <label className="f full">Notes<textarea maxLength={2000} value={t.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Which PDF, pages, formulas…" /></label>
            <label className="f full">Link<input type="url" maxLength={500} value={t.link} onChange={(e) => onChange({ link: e.target.value })} placeholder="https://…" /></label>
            <datalist id="propSubj">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        )}
      </div>
      <button className="icon-btn" aria-label="Remove" onClick={onRemove}><Icon name="x" size={16} /></button>
    </div>
  );
}

export function ProposalList({ tasks, onChange, subjects = [] }: { tasks: Proposal[]; onChange: (t: Proposal[]) => void; subjects?: string[] }) {
  const upd = (i: number, p: Partial<Proposal>) => onChange(tasks.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const last = tasks.at(-1);
  return (
    <>
      {tasks.map((t, i) => <Row key={i} t={t} subjects={subjects} onChange={(p) => upd(i, p)} onRemove={() => onChange(tasks.filter((_, j) => j !== i))} />)}
      <button className="soft sm" style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...tasks, { title: '', date: last?.date ?? today(), minutes: 30, keep: true, kind: 'study', subject: last?.subject ?? '', time: last?.time ?? '', repeat: '', notes: '', link: '' }])}>
        <Icon name="plus" size={14} /> Add a task
      </button>
    </>
  );
}

/* ---------- apply-to-all bar ---------- */
function ApplyAll({ tasks, onChange, subjects }: { tasks: Proposal[]; onChange: (t: Proposal[]) => void; subjects: string[] }) {
  const [subject, setSubject] = useState(tasks.find((t) => t.subject)?.subject ?? '');
  const [time, setTime] = useState(tasks.find((t) => t.time)?.time ?? '17:00');
  const all = (p: Partial<Proposal>) => onChange(tasks.map((t) => ({ ...t, ...p })));
  return (
    <div className="apply-all">
      <span className="label">Apply to all</span>
      <div className="apply-row">
        <input aria-label="Subject for all" maxLength={40} list="propSubjAll" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        <button className="soft sm" onClick={() => all({ subject: subject.trim() })}>Set subject</button>
      </div>
      <div className="apply-row">
        <input aria-label="Reminder time for all" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <button className="soft sm" onClick={() => all({ time })}>Set reminders</button>
        <button className="soft sm" onClick={() => all({ time: '' })}>No reminders</button>
      </div>
      <div className="apply-row">
        <button className="soft sm" onClick={() => all({ keep: true })}>Tick all</button>
        <button className="soft sm" onClick={() => all({ keep: false })}>Untick all</button>
      </div>
      <datalist id="propSubjAll">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

/* ---------- follow-up prompts ---------- */
const SUGGEST = [
  'Make the tasks shorter (max 30 min)',
  'Keep weekends lighter',
  'Add more practice questions',
  'Add revision days',
  'Add 2 timed mock tests near the end',
  'Spread it out more evenly',
  'Start with my weakest topic',
];

function Refine({ plan, setPlan, context }: { plan: Plan; setPlan: (p: Plan) => void; context: RefineContext }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [undo, setUndo] = useState<Plan[]>([]);

  const run = async (instruction: string) => {
    if (!instruction.trim() || busy) return;
    const kept = plan.tasks.filter((t) => t.keep);
    setBusy(true);
    try {
      const r = await api.refinePlan({
        instruction: instruction.trim(), today: today(), history, context: context.text,
        deadline: context.deadline || null, hoursPerDay: context.hoursPerDay ?? null,
        tasks: kept.map((t) => ({ title: t.title, date: t.date, minutes: t.minutes, kind: t.kind })),
      });
      // keep the extra details of tasks the AI left alone (matched by title)
      const byTitle = new Map(kept.map((t) => [t.title.trim().toLowerCase(), t]));
      const base = kept[0] ?? plan.tasks[0];
      const next = r.tasks.map((n): Proposal => {
        const old = byTitle.get(n.title.trim().toLowerCase());
        return {
          ...(old ?? { subject: base?.subject ?? '', time: base?.time ?? '', repeat: '' as Repeat, notes: '', link: '', srcId: undefined }),
          title: n.title, date: n.date, minutes: n.minutes, kind: (n.kind as Kind) || old?.kind || 'study', keep: true,
        } as Proposal;
      });
      setUndo([...undo, plan]);
      setPlan({ summary: r.summary || plan.summary, tasks: next });
      setHistory([...history, instruction.trim()]);
      setText('');
      toast('Plan updated. Check it, then keep refining or save.');
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="refine">
      <span className="label"><Icon name="sparkle" size={14} /> Not quite right? Tell the AI what to change</span>
      <div className="pills">
        {SUGGEST.map((s) => <button key={s} type="button" className="pill" disabled={busy} onClick={() => run(s)}>{s}</button>)}
      </div>
      <form className="quick" onSubmit={(e) => { e.preventDefault(); run(text); }}>
        <input aria-label="What should change" maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I'm busy Friday, move those tasks; do Percentage first" disabled={busy} />
        <button className="round" type="submit" aria-label="Revise plan" disabled={busy || !text.trim()}>{busy ? <span className="spin" /> : <Icon name="send" />}</button>
      </form>
      {(history.length > 0 || undo.length > 0) && (
        <div className="refine-log">
          {history.map((h, i) => <span key={i} className="chip">✓ {h}</span>)}
          {undo.length > 0 && (
            <button className="soft sm" disabled={busy} onClick={() => { setPlan(undo.at(-1)!); setUndo(undo.slice(0, -1)); setHistory(history.slice(0, -1)); }}>
              <Icon name="left" size={14} /> Undo last change
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type RefineContext = { text: string; deadline?: string | null; hoursPerDay?: number | null };

/** Everything to review an AI plan: summary, apply-to-all, editable rows, and follow-up prompts. */
export function PlanReview({ plan, setPlan, context, store }: { plan: Plan; setPlan: (p: Plan) => void; context: RefineContext; store: Store }) {
  const subjects = [...new Set([...store.subjects.map((s) => s.name), ...store.tasks.map((t) => t.subject)].filter(Boolean))];
  const n = keepers(plan.tasks).length;
  const mins = keepers(plan.tasks).reduce((a, t) => a + t.minutes, 0);
  const days = new Set(keepers(plan.tasks).map((t) => t.date).filter(Boolean)).size;
  return (
    <div className="proposal">
      {plan.summary && <p className="why" style={{ margin: 0 }}>{plan.summary}</p>}
      <p className="muted small" style={{ margin: 0 }}>{n} tasks · {Math.floor(mins / 60)}h {mins % 60}m over {days} day{days === 1 ? '' : 's'}. Tap <b>More</b> on a task for subject, reminder, repeat, notes and link.</p>
      <ApplyAll tasks={plan.tasks} onChange={(tasks) => setPlan({ ...plan, tasks })} subjects={subjects} />
      <ProposalList tasks={plan.tasks} onChange={(tasks) => setPlan({ ...plan, tasks })} subjects={subjects} />
      {store.state?.ai && <Refine plan={plan} setPlan={setPlan} context={context} />}
    </div>
  );
}

export const checkLinks = (tasks: Proposal[]) => {
  const b = badLink(keepers(tasks));
  if (b) { toast(`The link on “${b.title}” must start with http:// or https://`); return false; }
  return true;
};
