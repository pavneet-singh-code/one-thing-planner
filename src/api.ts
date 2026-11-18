export type Status = 'later' | 'today' | 'done';
export type Kind = 'study' | 'exam' | 'placement' | 'deadline';
export type Repeat = '' | 'daily' | 'weekdays' | 'weekly' | `days:${string}`;
export type SubjectKind = 'course' | 'exam' | 'placement' | 'project';
export interface Topic { title: string; done: boolean }
export interface Subject { id: string; name: string; kind: SubjectKind; examDate: string | null; topics: Topic[]; fileName: string }
export interface Step { text: string; done: boolean }
export interface Task {
  id: string;
  title: string;
  subject: string;
  notes: string;
  kind: Kind;
  link: string;
  repeat: Repeat;
  due: string | null;
  remindAt: string | null;
  est: number;
  status: Status;
  ord: number;
  steps: Step[];
  reminded: boolean;
  createdAt: string;
  doneAt: string | null;
}
export interface FocusDay { day: string; minutes: number }
export interface AppState { tasks: Task[]; focus: FocusDay[]; subjects: Subject[]; ai: boolean; push: boolean; vapidPublicKey: string }

const KEY = 'onething.key';
export const getKey = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setKey = (k: string) => { try { localStorage.setItem(KEY, k); } catch { /* private mode */ } };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${getKey()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  state: () => call<AppState>('GET', '/state'),
  createTasks: (tasks: Partial<Task>[]) => call<{ tasks: Task[] }>('POST', '/tasks', { tasks }),
  updateTask: (id: string, patch: Partial<Task>) => call<{ task: Task }>('PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
  deleteTask: (id: string) => call('DELETE', `/tasks/${encodeURIComponent(id)}`),
  logFocus: (day: string, minutes: number) => call<FocusDay>('POST', '/focus', { day, minutes }),
  setAlarm: (a: { id: string; at: string; title: string; body: string }) => call('POST', '/alarms', a),
  clearAlarm: (id: string) => call('DELETE', `/alarms/${encodeURIComponent(id)}`),
  subscribe: (subscription: PushSubscriptionJSON) => call('POST', '/push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => call('POST', '/push/unsubscribe', { endpoint }),
  testPush: () => call<{ sent: number; devices: number }>('POST', '/push/test'),
  planGoal: (b: { goal: string; deadline: string; hoursPerDay: number; today: string }) =>
    call<{ summary: string; rules?: string[]; tasks: { title: string; date: string; minutes: number; kind?: string }[] }>('POST', '/ai/plan-goal', b),
  refinePlan: (b: { instruction: string; tasks: { title: string; date: string; minutes: number; kind: string }[]; today: string; deadline: string | null; hoursPerDay: number | null; context: string; history: string[] }) =>
    call<{ summary: string; rules?: string[]; tasks: { title: string; date: string; minutes: number; kind?: string }[] }>('POST', '/ai/refine-plan', b),
  planDay: (b: { hours: number; today: string }) => call<{ pick: { id: string; why: string }[]; advice: string }>('POST', '/ai/plan-day', b),
  saveSubject: (s: Subject) => call<{ subject: Subject }>('PUT', `/subjects/${encodeURIComponent(s.id)}`, s),
  deleteSubject: (id: string) => call('DELETE', `/subjects/${encodeURIComponent(id)}`),
  readSyllabus: (b: { pdf?: string; text?: string; subject: string; kind: SubjectKind; examDate: string | null; hoursPerDay: number; today: string; plan: boolean }) =>
    call<{ topics: string[]; summary: string; tasks: { title: string; date: string; minutes: number; kind?: string }[] }>('POST', '/ai/syllabus', b),
  breakDown: (taskId: string) => call<{ steps: string[] }>('POST', '/ai/breakdown', { taskId }),
};

export const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
