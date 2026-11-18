import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { mmss } from '../dates';
import { toast } from '../store';
import { Icon } from './Icon';

const FOCUS = 25 * 60;
const BREAK = 5 * 60;
const LS = 'onething.timer';

interface TimerState { mode: 'focus' | 'break'; left: number; endsAt: number | null; taskId: string | null }
const fresh = (): TimerState => ({ mode: 'focus', left: FOCUS, endsAt: null, taskId: null });
const load = (): TimerState => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; } catch { return fresh(); } };
const save = (s: TimerState) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* ignore */ } };

let actx: AudioContext | undefined;
export function chime(freq = 880) {
  try {
    actx ??= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.6);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.65);
  } catch { /* no audio */ }
}

/**
 * 25/5 focus timer. The end time is stored, so it survives the app being closed;
 * the server also gets an "alarm" so the phone is notified when a session ends.
 */
export function FocusTimer({ taskId, taskTitle, onFocusDone }: { taskId: string; taskTitle: string; onFocusDone: (min: number) => void }) {
  const [t, setT] = useState<TimerState>(load);
  const [, tick] = useState(0);
  const doneRef = useRef(onFocusDone);
  doneRef.current = onFocusDone;

  const update = (s: TimerState) => { save(s); setT(s); };
  const running = t.endsAt != null;
  const left = running ? Math.max(0, Math.round((t.endsAt! - Date.now()) / 1000)) : t.left;

  // Tick while running; handle the end (also when coming back after the app was closed).
  useEffect(() => {
    if (!running) return;
    const finish = () => {
      if (t.endsAt == null || Date.now() < t.endsAt) return false;
      chime(660); setTimeout(() => chime(880), 250);
      if (t.mode === 'focus') {
        doneRef.current(25);
        toast('25 minutes done. Take a 5 minute break.');
        update({ ...t, mode: 'break', left: BREAK, endsAt: null });
      } else {
        toast('Break over. Back to your one thing.');
        update({ ...t, mode: 'focus', left: FOCUS, endsAt: null });
      }
      return true;
    };
    if (finish()) return;
    const h = setInterval(() => { if (!finish()) tick((n) => n + 1); }, 500);
    return () => clearInterval(h);
  }, [running, t]);

  // A different task became "now" while idle: reset.
  useEffect(() => {
    if (!running && t.taskId && t.taskId !== taskId) update(fresh());
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const endsAt = Date.now() + left * 1000;
    update({ ...t, endsAt, taskId });
    api.setAlarm({
      id: 'timer', at: new Date(endsAt).toISOString(),
      title: t.mode === 'focus' ? 'Focus session done' : 'Break over',
      body: t.mode === 'focus' ? `Take a 5 minute break. You were on: ${taskTitle}` : `Back to: ${taskTitle}`,
    }).catch(() => {});
  };
  const pause = () => { update({ ...t, left, endsAt: null }); api.clearAlarm('timer').catch(() => {}); };
  const reset = () => { update(fresh()); api.clearAlarm('timer').catch(() => {}); };

  const total = t.mode === 'break' ? BREAK : FOCUS;
  const pct = 1 - left / total;
  const R = 34, C = 2 * Math.PI * R;
  const label = running ? 'Pause' : t.mode === 'break' ? 'Start break' : left < FOCUS ? 'Resume' : 'Start focus';
  return (
    <div className={'timer-row' + (t.mode === 'break' ? ' break' : '')}>
      <div className="ring" role="timer" aria-label={`${t.mode === 'break' ? 'Break' : 'Focus'} ${mmss(left)} left`}>
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r={R} className="ring-bg" />
          <circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <span>{mmss(left)}</span>
      </div>
      <div className="timer-side">
        <div className="label">{t.mode === 'break' ? '5 min break' : '25 min focus'}</div>
        <div className="actions">
          <button className="primary" onClick={running ? pause : start}><Icon name={running ? 'pause' : 'play'} size={16} />{label}</button>
          {(running || left !== FOCUS || t.mode === 'break') && <button className="soft" onClick={reset}>Reset</button>}
        </div>
      </div>
    </div>
  );
}
