import { useEffect, useRef, useState } from 'react';
import { api, getKey, newId, setKey, type Task } from '../api';
import { addDays, today } from '../dates';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';
import { getName, setName, toast, type Store } from '../store';
import { getTheme, setTheme, type Theme } from '../theme';
import { Icon } from './Icon';
import { checkLinks, fromAi, fromTask, keepers, PlanReview, toFields, type Plan } from './Proposal';

/* ---------- AI ---------- */

export function AiPanel({ store }: { store: Store }) {
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState(addDays(today(), 7));
  const [hours, setHours] = useState(2);
  const [subject, setSubject] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busyGoal, setBusyGoal] = useState(false);
  const [justAdded, setJustAdded] = useState<{ n: number; subject: string } | null>(null);

  const [adjSubject, setAdjSubject] = useState('');
  const [adj, setAdj] = useState<Plan | null>(null);
  const [adjOriginal, setAdjOriginal] = useState<Task[]>([]);
  const adjRef = useRef<HTMLDivElement>(null);

  const [dayHours, setDayHours] = useState(3);
  const [dayPlan, setDayPlan] = useState<{ pick: { id: string; why: string }[]; advice: string } | null>(null);
  const [busyDay, setBusyDay] = useState(false);

  if (!store.state?.ai) return (
    <div className="page"><div className="card"><p className="note">AI is off. Add GEMINI_API_KEY to the server’s environment variables to turn it on.</p></div></div>
  );

  const subjects = [...new Set([...store.subjects.map((s) => s.name), ...store.tasks.map((t) => t.subject)].filter(Boolean))].sort();

  const makePlan = async () => {
    if (!goal.trim()) return;
    setBusyGoal(true); setPlan(null); setJustAdded(null);
    try {
      const r = await api.planGoal({ goal, deadline, hoursPerDay: hours, today: today() });
      setPlan({ summary: r.summary, rules: r.rules, tasks: fromAi(r.tasks, { subject: subject.trim(), time: '17:00' }) });
    } catch (e) { toast((e as Error).message); }
    finally { setBusyGoal(false); }
  };
  const kept = plan ? keepers(plan.tasks) : [];
  const acceptPlan = async () => {
    if (!plan || !checkLinks(plan.tasks)) return;
    await store.actions.add(kept.map(toFields));
    // track it as a project so its progress shows on Home and Subjects
    const names = [...new Set(kept.map((t) => t.subject.trim()).filter(Boolean))];
    for (const name of names) {
      if (!store.subjects.some((s) => s.name === name)) {
        await store.actions.saveSubject({ id: newId(), name, kind: 'project', examDate: deadline || null, topics: [], fileName: '' }).catch(() => {});
      }
    }
    setJustAdded({ n: kept.length, subject: kept.find((t) => t.subject)?.subject ?? '' });
    setPlan(null); setGoal('');
    toast(`Added ${kept.length} tasks.`);
  };

  /* adjust tasks that already exist */
  const loadAdjust = (subj: string) => {
    const td = today();
    const list = store.tasks
      .filter((t) => t.status !== 'done' && (!subj || t.subject === subj) && (!t.due || t.due >= td))
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
      .slice(0, 50);
    if (!list.length) { toast(subj ? `No open upcoming tasks for ${subj}.` : 'No open upcoming tasks.'); return; }
    setAdjSubject(subj);
    setAdjOriginal(list);
    setAdj({ summary: '', tasks: list.map(fromTask) });
    setTimeout(() => adjRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const adjKept = adj ? keepers(adj.tasks) : [];
  const adjKeptIds = new Set(adjKept.map((p) => p.srcId).filter(Boolean));
  const adjRemoved = adjOriginal.filter((t) => !adjKeptIds.has(t.id));
  const adjNew = adjKept.filter((p) => !p.srcId);
  const saveAdjust = async () => {
    if (!adj || !checkLinks(adj.tasks)) return;
    for (const t of adjRemoved) store.actions.remove(t);
    for (const p of adjKept) {
      const t = p.srcId && store.tasks.find((x) => x.id === p.srcId);
      if (t) store.actions.edit(t, toFields(p));
    }
    if (adjNew.length) await store.actions.add(adjNew.map(toFields));
    toast(`Saved: ${adjKept.length - adjNew.length} updated, ${adjNew.length} added, ${adjRemoved.length} removed.`);
    setAdj(null); setAdjOriginal([]);
  };

  const planDay = async () => {
    setBusyDay(true); setDayPlan(null);
    try { setDayPlan(await api.planDay({ hours: dayHours, today: today() })); }
    catch (e) { toast((e as Error).message); }
    finally { setBusyDay(false); }
  };
  const byId = (id: string) => store.tasks.find((t) => t.id === id);

  return (
    <div className="page">
      <div className="card">
        <div>
          <h2><Icon name="sparkle" /> Break a big goal into tasks</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Describe the goal and the deadline. The AI proposes tasks; you can edit every detail, then keep asking it to change things until the plan is right.</p>
        </div>
        <div className="grid">
          <label className="f full">Goal
            <textarea maxLength={1500} value={goal} onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. NALR exam: Partnerships, Coding-decoding, Mixture & alligation, Percentage. One PDF per topic; I'm weakest at mixtures." />
          </label>
          <label className="f">Deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="f">Hours / day<input type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 2)} /></label>
          <label className="f wide">Subject / project<input maxLength={40} list="aiSubj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. NALR or Video editor app" /></label>
          <datalist id="aiSubj">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="actions"><button className="primary" disabled={busyGoal || !goal.trim()} onClick={makePlan}>{busyGoal ? 'Planning…' : plan ? 'Start over' : 'Make a plan'}</button></div>
        {plan && (
          <>
            <PlanReview plan={plan} setPlan={setPlan} store={store} context={{ text: `${subject ? `Subject: ${subject}. ` : ''}${goal}`, deadline, hoursPerDay: hours }} />
            <div className="actions sticky-actions">
              <button className="primary" disabled={!kept.length} onClick={acceptPlan}>Add {kept.length} tasks</button>
              <button className="soft" onClick={() => setPlan(null)}>Discard</button>
            </div>
          </>
        )}
        {justAdded && (
          <div className="note-box">
            <span>Added {justAdded.n} tasks{justAdded.subject ? ` to “${justAdded.subject}” (progress shows on Home and in Subjects)` : ''}. Want to change how they’re spread out?</span>
            <button className="soft sm" onClick={() => { loadAdjust(justAdded.subject); setJustAdded(null); }}><Icon name="sparkle" size={14} /> Adjust them with AI</button>
          </div>
        )}
      </div>

      <div className="card" ref={adjRef}>
        <div>
          <h2><Icon name="edit" /> Adjust my tasks with AI</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Load your upcoming tasks, then ask for changes like “move everything off Sunday”, “add revision before the exam” or “I fell behind, re-plan the rest”. Nothing changes until you save.</p>
        </div>
        <div className="inline-form">
          <label className="f">Which tasks
            <select value={adjSubject} onChange={(e) => setAdjSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button className="soft" onClick={() => loadAdjust(adjSubject)}>{adj ? 'Reload' : 'Load tasks'}</button>
        </div>
        {adj && (
          <>
            <PlanReview plan={adj} setPlan={setAdj} store={store}
              context={{ text: `Re-planning the student's existing ${adjSubject || 'upcoming'} tasks.`, deadline: store.subjects.find((s) => s.name === adjSubject)?.examDate ?? null }} />
            <div className="actions sticky-actions">
              <button className="primary" onClick={saveAdjust}>Save changes</button>
              <span className="muted small">{adjKept.length - adjNew.length} kept · {adjNew.length} new · {adjRemoved.length} removed</span>
              <button className="soft" onClick={() => { setAdj(null); setAdjOriginal([]); }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div>
          <h2><Icon name="target" /> Pick today’s three for me</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>The AI looks at deadlines and time estimates and picks what matters most today.</p>
        </div>
        <div className="grid"><label className="f wide">Time I have today (hours)
          <input type="number" min={0.5} max={14} step={0.5} value={dayHours} onChange={(e) => setDayHours(Number(e.target.value) || 3)} /></label></div>
        <div className="actions"><button className="primary" disabled={busyDay} onClick={planDay}>{busyDay ? 'Thinking…' : 'Plan my day'}</button></div>
        {dayPlan && (
          <div className="proposal">
            {dayPlan.pick.map((p, i) => byId(p.id) && (
              <div className="prop" key={p.id}><span className="slot">{i + 1}</span><div><div className="strong">{byId(p.id)!.title}</div><div className="why">{p.why}</div></div></div>
            ))}
            {dayPlan.advice && <p className="why" style={{ margin: 0 }}>{dayPlan.advice}</p>}
            <div className="actions">
              <button className="primary" onClick={async () => { await store.actions.applyDayPlan(dayPlan.pick.map((p) => p.id).filter((id) => byId(id))); setDayPlan(null); toast('Today is set. Start with the first one.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Use this plan</button>
              <button className="soft" onClick={() => setDayPlan(null)}>Discard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
export function SettingsPanel({ store }: { store: Store }) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const standalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => { currentSubscription().then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false)); }, []);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const s = store.state;
  const toggle = async () => {
    setBusy(true);
    try {
      if (subscribed) { await disablePush(); setSubscribed(false); toast('Notifications off on this device.'); }
      else { await enablePush(s!.vapidPublicKey); setSubscribed(true); toast('Notifications on for this device.'); }
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  const test = async () => {
    try { const r = await api.testPush(); toast(r.sent ? `Sent to ${r.sent} device(s).` : 'No devices have notifications on.'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="page settings">
      <NameCard />
      <ThemeCard />
      <div className="card">
        <h2><Icon name="bell" /> Notifications</h2>
        {!s?.push ? <p className="note">Push is off on the server. Add the VAPID keys to the environment variables (see README).</p>
          : !pushSupported() ? <p className="note">This browser can’t receive push notifications. On Android, use Chrome.</p>
          : (
            <>
              <p className="muted small" style={{ margin: 0 }}>Reminders and focus-timer alarms arrive as phone notifications, even when the app is closed.</p>
              <div className="actions">
                <button className="primary" disabled={busy || subscribed === null} onClick={toggle}>{subscribed ? 'Turn off on this device' : 'Turn on notifications'}</button>
                {subscribed && <button className="soft" onClick={test}>Send a test</button>}
              </div>
            </>
          )}
      </div>
      <div className="card">
        <h2>Install on your phone</h2>
        {standalone ? <p className="muted small" style={{ margin: 0 }}>Installed. You’re using the app version.</p>
          : installEvt ? <div className="actions"><button className="primary" onClick={() => installEvt.prompt()}>Install app</button></div>
          : <p className="muted small" style={{ margin: 0 }}>In Chrome on Android: open the ⋮ menu and tap “Add to Home screen” or “Install app”.</p>}
      </div>
      <div className="card">
        <h2>Access key</h2>
        <p className="muted small" style={{ margin: 0 }}>This device is unlocked with your access key. Lock it to remove the key from this device.</p>
        <div className="actions"><button className="soft" onClick={() => { setKey(''); location.reload(); }} disabled={!getKey()}>Lock this device</button></div>
      </div>
    </div>
  );
}

function ThemeCard() {
  const [t, setT] = useState<Theme>(getTheme());
  const pick = (x: Theme) => { setT(x); setTheme(x); };
  return (
    <div className="card">
      <h2>Theme</h2>
      <div className="seg">
        <button type="button" className={t === 'light' ? 'on' : ''} onClick={() => pick('light')}>☀️ Light</button>
        <button type="button" className={t === 'dark' ? 'on' : ''} onClick={() => pick('dark')}>🌙 Dark</button>
        <button type="button" className={t === 'auto' ? 'on' : ''} onClick={() => pick('auto')}>Match phone</button>
      </div>
    </div>
  );
}

function NameCard() {
  const [n, setN] = useState(getName());
  return (
    <div className="card">
      <h2>Your name</h2>
      <p className="muted small" style={{ margin: 0 }}>Used for the greeting on the home page. Saved on this device only.</p>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setName(n.trim()); toast('Saved.'); }}>
        <label className="f">Name<input maxLength={30} value={n} onChange={(e) => setN(e.target.value)} placeholder="Your first name" /></label>
        <button className="primary" type="submit">Save</button>
      </form>
    </div>
  );
}

/* ---------- Key gate ---------- */
export function KeyGate({ onUnlock, error }: { onUnlock: () => void; error?: string }) {
  const [k, setK] = useState('');
  return (
    <div className="gate">
      <form className="card" onSubmit={(e) => { e.preventDefault(); setKey(k.trim()); onUnlock(); }}>
        <div className="brand big"><span className="logo" aria-hidden="true">1</span>One Thing</div>
        <p className="muted" style={{ margin: 0 }}>Enter your access key to open your planner on this device. You only need to do this once.</p>
        <label className="f">Access key<input type="password" autoComplete="current-password" value={k} onChange={(e) => setK(e.target.value)} autoFocus /></label>
        {error && <p className="err">{error}</p>}
        <div className="actions"><button className="primary" type="submit" disabled={!k.trim()}>Unlock</button></div>
      </form>
    </div>
  );
}
