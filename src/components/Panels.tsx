import { useEffect, useState } from 'react';
import { api, getKey, setKey } from '../api';
import { addDays, fmtDay, today } from '../dates';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';
import { toast, type Store } from '../store';

/* ---------- Week ---------- */
export function WeekPanel({ store }: { store: Store }) {
  const d = today();
  return (
    <div className="panel">
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(d, i);
          const items = store.tasks.filter((t) => t.due === day || (!t.due && t.remindAt && new Date(t.remindAt).toDateString() === new Date(day + 'T12:00').toDateString()));
          return (
            <div className={'day' + (i === 0 ? ' today' : '')} key={day}>
              <h3>{i === 0 ? 'Today' : fmtDay(day)}</h3>
              {items.length ? items.map((t) => <div key={t.id} className={'it' + (t.status === 'done' ? ' done' : '')}>{t.title}</div>)
                : <div className="muted small">Free</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- AI ---------- */
export function AiPanel({ store }: { store: Store }) {
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState(addDays(today(), 7));
  const [hours, setHours] = useState(2);
  const [subject, setSubject] = useState('');
  const [plan, setPlan] = useState<{ summary: string; tasks: { title: string; date: string; minutes: number; keep: boolean }[] } | null>(null);
  const [remind, setRemind] = useState(true);
  const [busyGoal, setBusyGoal] = useState(false);

  const [dayHours, setDayHours] = useState(3);
  const [dayPlan, setDayPlan] = useState<{ pick: { id: string; why: string }[]; advice: string } | null>(null);
  const [busyDay, setBusyDay] = useState(false);

  if (!store.state?.ai) return (
    <div className="panel"><p className="note">AI is off. Add GEMINI_API_KEY to the server’s environment variables to turn it on.</p></div>
  );

  const makePlan = async () => {
    if (!goal.trim()) return;
    setBusyGoal(true); setPlan(null);
    try {
      const r = await api.planGoal({ goal, deadline, hoursPerDay: hours, today: today() });
      setPlan({ summary: r.summary, tasks: r.tasks.map((t) => ({ ...t, keep: true })) });
    } catch (e) { toast((e as Error).message); }
    finally { setBusyGoal(false); }
  };
  const acceptPlan = async () => {
    if (!plan) return;
    const keep = plan.tasks.filter((t) => t.keep);
    await store.actions.add(keep.map((t) => ({
      title: t.title, subject: subject.trim(), due: t.date || null, est: t.minutes,
      remindAt: remind && t.date ? new Date(t.date + 'T17:00').toISOString() : null,
    })));
    setPlan(null); setGoal('');
    toast(`Added ${keep.length} tasks to Later.`);
  };

  const planDay = async () => {
    setBusyDay(true); setDayPlan(null);
    try { setDayPlan(await api.planDay({ hours: dayHours, today: today() })); }
    catch (e) { toast((e as Error).message); }
    finally { setBusyDay(false); }
  };
  const byId = (id: string) => store.tasks.find((t) => t.id === id);

  return (
    <div className="panel">
      <div className="card">
        <div>
          <h2>Break a big goal into tasks</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Describe the goal and the deadline. The AI proposes small tasks spread across the days; you choose which to keep.</p>
        </div>
        <div className="grid">
          <label className="f full">Goal
            <textarea id="gGoal" maxLength={1500} value={goal} onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Physics mid-term on chapters 4–7: kinematics, laws of motion, work & energy, rotation. I'm weak at rotation." />
          </label>
          <label className="f">Deadline<input id="gDate" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="f">Hours / day<input id="gHours" type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 2)} /></label>
          <label className="f wide">Subject<input id="gSubject" maxLength={40} list="subjList" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics" /></label>
        </div>
        <div className="actions"><button className="primary" disabled={busyGoal || !goal.trim()} onClick={makePlan}>{busyGoal ? 'Planning…' : 'Make a plan'}</button></div>
        {plan && (
          <div className="proposal">
            {plan.summary && <p className="why" style={{ margin: 0 }}>{plan.summary}</p>}
            {plan.tasks.map((t, i) => (
              <label className="prop" key={i}>
                <input type="checkbox" checked={t.keep} onChange={(e) => setPlan({ ...plan, tasks: plan.tasks.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) })} />
                <div><div className="strong">{t.title}</div>
                  <div className="meta"><span className="chip">{t.date ? fmtDay(t.date) : 'no date'}</span><span className="chip">{t.minutes} min</span></div></div>
              </label>
            ))}
            <label className="prop"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} /><div>Remind me at 5:00 pm on each task’s day</div></label>
            <div className="actions">
              <button className="primary" onClick={acceptPlan}>Add {plan.tasks.filter((t) => t.keep).length} tasks</button>
              <button className="ghost" onClick={() => setPlan(null)}>Discard</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div>
          <h2>Pick today’s three for me</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>The AI looks at deadlines and time estimates and picks what matters most today.</p>
        </div>
        <div className="grid"><label className="f wide">Time I have today (hours)
          <input id="dHours" type="number" min={0.5} max={14} step={0.5} value={dayHours} onChange={(e) => setDayHours(Number(e.target.value) || 3)} /></label></div>
        <div className="actions"><button className="primary" disabled={busyDay} onClick={planDay}>{busyDay ? 'Thinking…' : 'Plan my day'}</button></div>
        {dayPlan && (
          <div className="proposal">
            {dayPlan.pick.map((p, i) => byId(p.id) && (
              <div className="prop" key={p.id}><div className="slot">{i + 1}</div><div><div className="strong">{byId(p.id)!.title}</div><div className="why">{p.why}</div></div></div>
            ))}
            {dayPlan.advice && <p className="why" style={{ margin: 0 }}>{dayPlan.advice}</p>}
            <div className="actions">
              <button className="primary" onClick={async () => { await store.actions.applyDayPlan(dayPlan.pick.map((p) => p.id).filter((id) => byId(id))); setDayPlan(null); toast('Today is set. Start with the first one.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Use this plan</button>
              <button className="ghost" onClick={() => setDayPlan(null)}>Discard</button>
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
    <div className="panel">
      <div className="card">
        <h2>Notifications</h2>
        {!s?.push ? <p className="note">Push is off on the server. Add the VAPID keys to the environment variables (see README).</p>
          : !pushSupported() ? <p className="note">This browser can’t receive push notifications. On Android, use Chrome.</p>
          : (
            <>
              <p className="muted small" style={{ margin: 0 }}>Reminders and focus-timer alarms arrive as phone notifications, even when the app is closed.</p>
              <div className="actions">
                <button className="primary" disabled={busy || subscribed === null} onClick={toggle}>{subscribed ? 'Turn off on this device' : 'Turn on notifications'}</button>
                {subscribed && <button onClick={test}>Send a test</button>}
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
        <div className="actions"><button onClick={() => { setKey(''); location.reload(); }} disabled={!getKey()}>Lock this device</button></div>
      </div>
    </div>
  );
}

/* ---------- Key gate ---------- */
export function KeyGate({ onUnlock, error }: { onUnlock: () => void; error?: string }) {
  const [k, setK] = useState('');
  return (
    <div className="gate">
      <form className="card" onSubmit={(e) => { e.preventDefault(); setKey(k.trim()); onUnlock(); }}>
        <h1>One <span className="hl">Thing</span></h1>
        <p className="muted" style={{ margin: 0 }}>Enter your access key to open your planner on this device. You only need to do this once.</p>
        <label className="f">Access key<input id="key" type="password" autoComplete="current-password" value={k} onChange={(e) => setK(e.target.value)} autoFocus /></label>
        {error && <p className="err">{error}</p>}
        <div className="actions"><button className="primary" type="submit" disabled={!k.trim()}>Unlock</button></div>
      </form>
    </div>
  );
}
