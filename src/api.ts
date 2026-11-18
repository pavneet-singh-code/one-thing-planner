export type Status = 'later' | 'today' | 'done';
export interface Step { text: string; done: boolean }
export interface Task {
  id: string;
  title: string;
  subject: string;
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
export interface AppState { tasks: Task[]; focus: FocusDay[]; ai: boolean; push: boolean; vapidPublicKey: string }

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
    call<{ summary: string; tasks: { title: string; date: string; minutes: number }[] }>('POST', '/ai/plan-goal', b),
  planDay: (b: { hours: number; today: string }) => call<{ pick: { id: string; why: string }[]; advice: string }>('POST', '/ai/plan-day', b),
  breakDown: (taskId: string) => call<{ steps: string[] }>('POST', '/ai/breakdown', { taskId }),
};

export const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
