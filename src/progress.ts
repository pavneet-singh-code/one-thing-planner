import type { Subject, Task } from './api';
import { daysBetween, today } from './dates';

/** Progress of one subject / project: how much is done, how much *should* be done by now, what's next. */
export function progressOf(tasks: Task[], s: Pick<Subject, 'name' | 'topics' | 'examDate'>) {
  const td = today();
  // the exam / placement / deadline markers themselves are events, not work to finish
  const all = tasks.filter((t) => t.subject === s.name && (t.kind === 'study' || t.kind === 'deadline'));
  const done = all.filter((t) => t.status === 'done').length;
  const dueByNow = all.filter((t) => t.due && t.due < td).length; // tasks that should be finished before today
  const overdue = all.filter((t) => t.status !== 'done' && t.due && t.due < td).length;
  const minsLeft = all.filter((t) => t.status !== 'done').reduce((a, t) => a + t.est, 0);
  const next = all.filter((t) => t.status !== 'done').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))[0];
  const total = all.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const expectedPct = total ? Math.round((Math.min(dueByNow, total) / total) * 100) : 0;
  const daysLeft = s.examDate ? daysBetween(td, s.examDate) : null;
  const status: 'done' | 'behind' | 'on-track' | 'empty' = !total ? 'empty' : done === total ? 'done' : overdue > 0 ? 'behind' : 'on-track';
  const topicsDone = s.topics.filter((t) => t.done).length;
  return { total, done, pct, expectedPct, overdue, minsLeft, next, daysLeft, status, topicsDone };
}

export const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
