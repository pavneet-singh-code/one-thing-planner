import { today } from '../dates';
import { Icon } from './Icon';

export type Proposal = { title: string; date: string; minutes: number; keep: boolean };

/** An AI-proposed list of tasks the user can edit, untick, remove or add to before saving. */
export function ProposalList({ tasks, onChange }: { tasks: Proposal[]; onChange: (t: Proposal[]) => void }) {
  const upd = (i: number, p: Partial<Proposal>) => onChange(tasks.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <>
      {tasks.map((t, i) => (
        <div className={'prop' + (t.keep ? '' : ' off')} key={i}>
          <input type="checkbox" aria-label="Keep this task" checked={t.keep} onChange={(e) => upd(i, { keep: e.target.checked })} />
          <div className="prop-fields">
            <input className="bare strong" aria-label="Task" maxLength={140} value={t.title} placeholder="Task" onChange={(e) => upd(i, { title: e.target.value })} />
            <div className="prop-row">
              <input type="date" aria-label="Day" value={t.date} onChange={(e) => upd(i, { date: e.target.value })} />
              <label className="mins"><input type="number" aria-label="Minutes" min={5} max={600} step={5} value={t.minutes} onChange={(e) => upd(i, { minutes: Number(e.target.value) || 30 })} /> min</label>
            </div>
          </div>
          <button className="icon-btn" aria-label="Remove" onClick={() => onChange(tasks.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <button className="soft sm" style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...tasks, { title: '', date: tasks.at(-1)?.date ?? today(), minutes: 30, keep: true }])}>
        <Icon name="plus" size={14} /> Add a task
      </button>
    </>
  );
}

export const keepers = (tasks: Proposal[]) => tasks.filter((t) => t.keep && t.title.trim());
