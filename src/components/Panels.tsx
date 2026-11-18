import { useEffect, useState } from 'react';
import { api, getKey, setKey } from '../api';
import { addDays, today } from '../dates';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';
import { getName, setName, toast, type Store } from '../store';
import { Icon } from './Icon';
import { keepers, ProposalList, type Proposal } from './Proposal';

/* ---------- AI ---------- */

export function AiPanel({ store }: { store: Store }) {
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState(addDays(today(), 7));
  const [hours, setHours] = useState(2);
  const [subject, setSubject] = useState('');
  const [plan, setPlan] = useState<{ summary: string; tasks: Proposal[] } | null>(null);
  const [remind, setRemind] = useState(true);
  const [busyGoal, setBusyGoal] = useState(false);

  const [dayHours, setDayHours] = useState(3);
  const [dayPlan, setDayPlan] = useState<{ pick: { id: string; why: string }[]; advice: string } | null>(null);
  const [busyDay, setBusyDay] = useState(false);

  if (!store.state?.ai) return (
    <div className="page"><div className="card"><p className="note">AI is off. Add GEMINI_API_KEY to the server’s environment variables to turn it on.</p></div></div>
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
  const kept = plan ? keepers(plan.tasks) : [];
  const acceptPlan = async () => {
    if (!plan) return;
    await store.actions.add(kept.map((t) => ({
      title: t.title.trim(), subject: subject.trim(), due: t.date || null, est: t.minutes,
      remindAt: remind && t.date ? new Date(t.date + 'T17:00').toISOString() : null,
    })));
    setPlan(null); setGoal('');
    toast(`Added ${kept.length} tasks to Later.`);
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
          <p className="muted small" style={{ margin: '4px 0 0' }}>Describe the goal and the deadline. The AI proposes small tasks spread across the days. Edit, remove or add tasks before you keep them.</p>
        </div>
        <div className="grid">
          <label className="f full">Goal
            <textarea maxLength={1500} value={goal} onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. NALR exam: Partnerships, Coding-decoding, Mixture & alligation, Percentage. One PDF per topic; I'm weakest at mixtures." />
          </label>
          <label className="f">Deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="f">Hours / day<input type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 2)} /></label>
          <label className="f wide">Subject<input maxLength={40} list="subjList" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="NALR" /></label>
        </div>
        <div className="actions"><button className="primary" disabled={busyGoal || !goal.trim()} onClick={makePlan}>{busyGoal ? 'Planning…' : 'Make a plan'}</button></div>
        {plan && (
          <div className="proposal">
            {plan.summary && <p className="why" style={{ margin: 0 }}>{plan.summary}</p>}
            <ProposalList tasks={plan.tasks} onChange={(tasks) => setPlan({ ...plan, tasks })} />
            <label className="check-line"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Remind me at 5:00 pm on each task’s day</label>
            <div className="actions">
              <button className="primary" disabled={!kept.length} onClick={acceptPlan}>Add {kept.length} tasks</button>
              <button className="soft" onClick={() => setPlan(null)}>Discard</button>
            </div>
          </div>
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
