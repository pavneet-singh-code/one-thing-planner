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
  { id: 'course', label: 'Course' },
];

export const REPEATS: { id: Repeat; label: string }[] = [
  { id: '', label: 'Never' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
];

/** Colour class for a task card: special kinds get their own strong colour, study tasks use the subject colour. */
export const taskClass = (t: Task) => (t.kind && t.kind !== 'study' ? 'k-' + t.kind : subjectClass(t.subject));
