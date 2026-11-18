import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, newId, type AppState, type Task } from './api';
import { today } from './dates';

/* ---------- toast ---------- */
type ToastFn = (msg: string) => void;
let toastListener: ToastFn = () => {};
export const toast: ToastFn = (m) => toastListener(m);
export function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef<number>(undefined);
  useEffect(() => {
    toastListener = (m) => { setMsg(m); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(''), 3000); };
    return () => { toastListener = () => {}; };
  }, []);
  return msg;
}

export const TODAY_LIMIT = 3;

export function useStore() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
    }
  }, []);

  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const fail = useCallback((e: unknown) => {
    toast(e instanceof Error ? e.message : 'Something went wrong.');
    load();
  }, [load]);

  const replaceTask = (t: Task) => setState((s) => s && { ...s, tasks: s.tasks.map((x) => (x.id === t.id ? t : x)) });

  const patch = useCallback(async (id: string, p: Partial<Task>) => {
    setState((s) => s && { ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...p } : x)) });
    try { replaceTask((await api.updateTask(id, p)).task); } catch (e) { fail(e); }
  }, [fail]);

  const derived = useMemo(() => {
    const tasks = state?.tasks ?? [];
    const todays = tasks.filter((t) => t.status === 'today').sort((a, b) => a.ord - b.ord);
    const laters = tasks.filter((t) => t.status === 'later')
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));
    const dones = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
    return { tasks, todays, laters, dones };
  }, [state]);

  const actions = useMemo(() => {
    const cur = () => {
      const tasks = stateRef.current?.tasks ?? [];
      const todays = tasks.filter((t) => t.status === 'today').sort((a, b) => a.ord - b.ord);
      return { tasks, todays, maxOrd: Math.max(0, ...todays.map((t) => t.ord)), minOrd: Math.min(0, ...todays.map((t) => t.ord)) };
    };
    return {
      async add(items: { title: string; subject?: string; due?: string | null; remindAt?: string | null; est?: number; wantToday?: boolean }[]) {
        const { todays, maxOrd } = cur();
        let free = TODAY_LIMIT - todays.length;
        const now = new Date().toISOString();
        const fresh: Task[] = items.map((x, i) => {
          const toToday = x.wantToday && free > 0;
          if (toToday) free--;
          return {
            id: newId() + i, title: x.title, subject: x.subject ?? '', due: x.due || null, remindAt: x.remindAt || null,
            est: x.est ?? 30, status: toToday ? 'today' : 'later', ord: toToday ? maxOrd + 1 + i : 0,
            steps: [], reminded: false, createdAt: now, doneAt: null,
          };
        });
        setState((s) => s && { ...s, tasks: [...s.tasks, ...fresh] });
        try {
          const { tasks } = await api.createTasks(fresh);
          setState((s) => s && { ...s, tasks: s.tasks.map((t) => tasks.find((n) => n.id === t.id) ?? t) });
        } catch (e) { fail(e); }
        return fresh;
      },
      moveToday(t: Task) {
        const { todays, maxOrd } = cur();
        if (todays.length >= TODAY_LIMIT) { toast('Today already has three. Finish or park one first.'); return; }
        patch(t.id, { status: 'today', ord: maxOrd + 1 });
      },
      park: (t: Task) => patch(t.id, { status: 'later' }),
      makeNow(t: Task) {
        const { todays, minOrd } = cur();
        if (t.status !== 'today' && todays.length >= TODAY_LIMIT) patch(todays[todays.length - 1].id, { status: 'later' });
        patch(t.id, { status: 'today', ord: minOrd - 1 });
      },
      skip() {
        const { todays, maxOrd } = cur();
        if (todays.length > 1) patch(todays[0].id, { ord: maxOrd + 1 });
      },
      complete(t: Task) {
        patch(t.id, { status: 'done', doneAt: new Date().toISOString() });
        toast('Done. Nice work.');
      },
      reopen: (t: Task) => patch(t.id, { status: 'later', doneAt: null }),
      async remove(t: Task) {
        setState((s) => s && { ...s, tasks: s.tasks.filter((x) => x.id !== t.id) });
        try { await api.deleteTask(t.id); } catch (e) { fail(e); }
      },
      setSteps: (t: Task, steps: Task['steps']) => patch(t.id, { steps }),
      setReminder: (t: Task, remindAt: string | null) => patch(t.id, { remindAt, reminded: false }),
      async applyDayPlan(ids: string[]) {
        const { todays } = cur();
        const keep = new Set(ids);
        await Promise.all([
          ...todays.filter((t) => !keep.has(t.id)).map((t) => patch(t.id, { status: 'later' })),
          ...ids.map((id, i) => patch(id, { status: 'today', ord: i + 1 })),
        ]);
      },
      async logFocus(minutes: number) {
        const day = today();
        setState((s) => {
          if (!s) return s;
          const has = s.focus.some((f) => f.day === day);
          return { ...s, focus: has ? s.focus.map((f) => (f.day === day ? { ...f, minutes: f.minutes + minutes } : f)) : [{ day, minutes }, ...s.focus] };
        });
        try { await api.logFocus(day, minutes); } catch (e) { fail(e); }
      },
    };
  }, [patch, fail]);

  return { state, error, load, ...derived, actions };
}

export type Store = ReturnType<typeof useStore>;
