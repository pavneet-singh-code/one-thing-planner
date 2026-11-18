import type { Kind, Repeat, SubjectKind, Task } from './api';
import { subjectClass } from './subjects';

export const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'study', label: 'Study', hint: 'Normal study task' },
  { id: 'exam', label: 'Exam', hint: 'An exam or test date' },
  { id: 'placement', label: 'Placement', hint: 'Drive, online test or interview' },
  { id: 'deadline', label: 'Deadline', hint: 'Assignment, form or submission due' },
];
export const kindLabel = (k: Kind) => KINDS.find((x) => x.id === k)?.label ?? 'Study';

export const SUBJECT_KINDS: { id: SubjectKind; label: string }[] = [
  { id: 'exam', label: 'Exam' },
  { id: 'placement', label: 'Placement' },
  { id: 'project', label: 'Project' },
  { id: 'course', label: 'Course' },
];
/** Calendar / tag label for a subject's date */
export const subjectDateLabel = (k: SubjectKind) => (k === 'placement' ? 'Placement' : k === 'exam' ? 'Exam' : k === 'project' ? 'Project due' : 'Finish by');

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const parseDays = (r: string) => (r.startsWith('days:') ? r.slice(5).split(',').map(Number).filter((n) => n >= 0 && n <= 6) : []);
/** "Daily", "Mon–Fri", "Weekly (Tue)", "Mon, Wed, Fri" */
export function repeatLabel(r: Repeat, due?: string | null) {
  if (!r) return '';
  if (r === 'daily') return 'Daily';
  if (r === 'weekdays') return 'Mon–Fri';
  if (r === 'weekly') return due ? `Weekly (${DAY_SHORT[new Date(due + 'T12:00').getDay()]})` : 'Weekly';
  const d = parseDays(r);
  return d.length === 7 ? 'Daily' : d.map((x) => DAY_SHORT[x]).join(', ');
}

/** Colour class for a task card: special kinds get their own strong colour, study tasks use the subject colour. */
export const taskClass = (t: Task) => (t.kind && t.kind !== 'study' ? 'k-' + t.kind : subjectClass(t.subject));
