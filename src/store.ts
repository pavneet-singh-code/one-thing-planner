import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, newId, type AppState, type Kind, type Repeat, type Subject, type Task } from './api';
import { addDays, latestRepeat, nextRepeat, pendingDays, today, ymd } from './dates';

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
    const subjects = state?.subjects ?? [];
    return { tasks, todays, laters, dones, subjects };
  }, [state]);

  const actions = useMemo(() => {
    const cur = () => {
      const tasks = stateRef.current?.tasks ?? [];
      const todays = tasks.filter((t) => t.status === 'today').sort((a, b) => a.ord - b.ord);
      return { tasks, todays, maxOrd: Math.max(0, ...todays.map((t) => t.ord)), minOrd: Math.min(0, ...todays.map((t) => t.ord)) };
    };
    const a = {
      async add(items: { title: string; subject?: string; folder?: string; notes?: string; kind?: Kind; link?: string; repeat?: Repeat; due?: string | null; remindAt?: string | null; est?: number; wantToday?: boolean }[]) {
        const { todays, maxOrd } = cur();
        let free = TODAY_LIMIT - todays.length;
        const now = new Date().toISOString();
        const fresh: Task[] = items.map((x, i) => {
          const toToday = x.wantToday && free > 0;
          if (toToday) free--;
          return {
            id: newId() + i, title: x.title, subject: x.subject ?? '', folder: x.folder ?? '', notes: x.notes ?? '', kind: x.kind ?? 'study', link: x.link ?? '', repeat: x.repeat ?? '', due: x.due || null, remindAt: x.remindAt || null,
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
        if (t.repeat) {
          // Repeating task: queue the next one, same details, fresh steps.
          const due = nextRepeat(t.due ?? today(), t.repeat);
          const shift = t.due ? (new Date(due + 'T12:00').getTime() - new Date(t.due + 'T12:00').getTime()) : 0;
          const remindAt = t.remindAt ? new Date(new Date(t.remindAt).getTime() + (shift || 86400000)).toISOString() : null;
          a.add([{ title: t.title, subject: t.subject, folder: t.folder, notes: t.notes, kind: t.kind, link: t.link, repeat: t.repeat, est: t.est, due, remindAt }])
            .then(([n]) => { if (t.steps.length) patch(n.id, { steps: t.steps.map((s) => ({ ...s, done: false })) }); });
          const left = pendingDays(due, t.repeat);
          const when = new Date(due + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
          toast(left > 1 ? `Done. Next: ${when}. ${left} days of this are still pending.` : left === 1 ? `Done. Next one (${when}) is due now.` : `Done. Next one is on ${when}.`);
        } else toast('Done. Nice work.');
      },
      /** Repeating task that fell behind: drop the missed days and jump to the latest scheduled day (usually today). */
      skipMissed(t: Task) {
        if (!t.repeat || !t.due) return;
        const day = latestRepeat(t.due, t.repeat);
        if (day !== t.due) { a.moveToDay(t, day); toast('Skipped the missed days.'); }
      },
      /** Put several tasks into one folder (e.g. name an unsorted AI plan "Viva"). */
      setFolder(ids: string[], folder: string) {
        for (const id of ids) patch(id, { folder: folder.trim().slice(0, 60) });
      },
      /** Rename a folder inside a subject (all its tasks follow). */
      renameFolder(subject: string, from: string, to: string) {
        const ids = (stateRef.current?.tasks ?? []).filter((t) => t.subject === subject && t.folder === from).map((t) => t.id);
        a.setFolder(ids, to);
      },
      /** Move a task to another day; its reminder moves by the same number of days. */
      moveToDay(t: Task, day: string) {
        if (t.due === day) return;
        const from = t.due ?? (t.remindAt ? ymd(new Date(t.remindAt)) : null);
        let remindAt = t.remindAt;
        if (remindAt && from) {
          const delta = new Date(day + 'T12:00').getTime() - new Date(from + 'T12:00').getTime();
          remindAt = new Date(new Date(remindAt).getTime() + delta).toISOString();
        }
        patch(t.id, { due: day, ...(remindAt !== t.remindAt ? { remindAt, reminded: false } : {}) });
      },
      reorderToday(ids: string[]) {
        ids.forEach((id, i) => patch(id, { ord: i + 1 }));
      },
      /** Schedule revision tasks for a finished task, `offsets` days from today. */
      async addRevisions(t: Task, offsets: number[]) {
        const td = today();
        const base = t.title.replace(/^Revise( \(\d\/\d\))?: /, '');
        await a.add(offsets.map((o, i) => ({
          title: `Revise${offsets.length > 1 ? ` (${i + 1}/${offsets.length})` : ''}: ${base}`.slice(0, 140),
          subject: t.subject, folder: t.folder, notes: t.notes, est: Math.min(30, Math.max(10, Math.round(t.est / 2))),
          due: addDays(td, o), remindAt: new Date(addDays(td, o) + 'T17:00').toISOString(),
        })));
        toast(offsets.length > 1 ? `${offsets.length} revisions scheduled.` : 'Revision scheduled.');
      },
      async saveSubject(s: Subject) {
        const old = stateRef.current?.subjects.find((x) => x.id === s.id);
        setState((st) => st && {
          ...st,
          subjects: st.subjects.some((x) => x.id === s.id) ? st.subjects.map((x) => (x.id === s.id ? s : x)) : [...st.subjects, s],
          tasks: old && old.name !== s.name ? st.tasks.map((t) => (t.subject === old.name ? { ...t, subject: s.name } : t)) : st.tasks,
        });
        try { await api.saveSubject(s); } catch (e) { fail(e); throw e; }
      },
      async deleteSubject(s: Subject) {
        setState((st) => st && { ...st, subjects: st.subjects.filter((x) => x.id !== s.id) });
        try { await api.deleteSubject(s.id); } catch (e) { fail(e); }
      },
      reopen: (t: Task) => patch(t.id, { status: 'later', doneAt: null }),
      async remove(t: Task) {
        setState((s) => s && { ...s, tasks: s.tasks.filter((x) => x.id !== t.id) });
        try { await api.deleteTask(t.id); } catch (e) { fail(e); }
      },
      setSteps: (t: Task, steps: Task['steps']) => patch(t.id, { steps }),
      edit(t: Task, p: Partial<Pick<Task, 'title' | 'subject' | 'folder' | 'notes' | 'due' | 'est' | 'remindAt' | 'steps' | 'kind' | 'link' | 'repeat'>>) {
        const changed = Object.fromEntries(Object.entries(p).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(t[k as keyof Task])));
        if (!Object.keys(changed).length) return;
        if ('remindAt' in changed) (changed as Partial<Task>).reminded = false;
        patch(t.id, changed);
      },
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
    return a;
  }, [patch, fail]);

  return { state, error, load, ...derived, actions };
}

export type Store = ReturnType<typeof useStore>;

/* ---------- display name (this device only) ---------- */
const NAME = 'onething.name';
export const getName = () => { try { return localStorage.getItem(NAME) ?? ''; } catch { return ''; } };
export const setName = (n: string) => { try { localStorage.setItem(NAME, n); } catch { /* ignore */ } };
