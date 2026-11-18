import { useState } from 'react';
import type { Kind, Subject, Task } from '../api';
import { addDays, dayNum, daysBetween, fmtClock, fmtDay, fmtShort, startOfWeek, today, weekday, ymd } from '../dates';
import { useDrag } from '../drag';
import { KINDS, taskClass } from '../kinds';
import { toast, type Store } from '../store';
import { Icon } from './Icon';
import { useEditor } from './TaskEditor';
import { TaskRow } from './Tasks';

export function tasksOn(store: Store, day: string) {
  return store.tasks
    .filter((t) => t.due === day || (!t.due && t.remindAt && ymd(new Date(t.remindAt)) === day))
    .sort((a, b) => rank(a) - rank(b) || (a.remindAt ?? '').localeCompare(b.remindAt ?? ''));
}
const rank = (t: Task) => (t.kind === 'exam' || t.kind === 'placement' ? 0 : t.kind === 'deadline' ? 1 : t.status === 'done' ? 3 : 2);
const subjectsOn = (store: Store, day: string) => store.subjects.filter((s) => s.examDate === day && s.kind !== 'course');

/** One day: exam/placement markers, then tasks. Tasks can be dragged to another day. */
function DayColumn({ store, day, compact, drag, goTo }: {
  store: Store; day: string; compact?: boolean; drag: ReturnType<typeof useDrag>; goTo: (tab: string) => void;
}) {
  const edit = useEditor();
  const td = today();
  const items = tasksOn(store, day);
  const marks = subjectsOn(store, day);
  const mins = items.filter((t) => t.status !== 'done' && t.kind === 'study').reduce((a, t) => a + t.est, 0);
  return (
    <div className={(compact ? 'strip-day' : 'cal-day') + (day === td ? ' today' : '') + (day < td ? ' past' : '')} data-drop={`day:${day}`}>
      <div className={compact ? 'strip-head' : 'cal-head'}>
        <span>{weekday(day)}</span><b>{dayNum(day)}</b>
        {!compact && mins > 0 && <small>{mins >= 60 ? `${Math.round(mins / 6) / 10}h` : `${mins}m`}</small>}
      </div>
      {marks.map((s) => <SubjectMark key={s.id} s={s} onClick={() => goTo('subjects')} />)}
      {items.map((t) => (
        <div key={t.id} className={'event ' + taskClass(t) + (t.status === 'done' ? ' done' : '')} {...drag(t.id)}
          role="button" tabIndex={0} onClick={() => edit({ task: t })} onKeyDown={(e) => { if (e.key === 'Enter') edit({ task: t }); }}>
          {t.kind !== 'study' && <span className="event-k">{KINDS.find((k) => k.id === t.kind)?.label}</span>}
          <span className="event-t">{t.title}</span>
          <span className="event-m">
            {t.remindAt && ymd(new Date(t.remindAt)) === day ? fmtClock(t.remindAt) : `${t.est} min`}
            {!compact && t.subject ? ` · ${t.subject}` : ''}
            {t.repeat && ' · ↻'}
          </span>
          {t.link && (
            <a className="event-link" href={t.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} aria-label="Open link">
              <Icon name="link" size={13} /> Open
            </a>
          )}
        </div>
      ))}
      {day >= td && (
        <button className="add-slot" aria-label={`Add task on ${fmtDay(day)}`} onClick={() => edit({ preset: { due: day, wantToday: day === td } })}>
          <Icon name="plus" size={14} />{!compact && ' Add'}
        </button>
      )}
    </div>
  );
}

function SubjectMark({ s, onClick }: { s: Subject; onClick: () => void }) {
  return (
    <button className={'event mark k-' + s.kind} onClick={onClick}>
      <span className="event-k">{s.kind === 'placement' ? 'Placement' : 'Exam'}</span>
      <span className="event-t">{s.name}</span>
    </button>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-label="Colour key">
      <span><i className="dot k-exam" />Exam</span>
      <span><i className="dot k-placement" />Placement</span>
      <span><i className="dot k-deadline" />Deadline</span>
      <span><i className="dot s0" /><i className="dot s1" /><i className="dot s2" />Study (by subject)</span>
    </div>
  );
}

function useDayDrop(store: Store) {
  return useDrag((id, target) => {
    if (!target.startsWith('day:')) return;
    const t = store.tasks.find((x) => x.id === id);
    if (!t) return;
    const day = target.slice(4);
    store.actions.moveToDay(t, day);
    if (t.due !== day) toast(`Moved to ${fmtDay(day)}.`);
  });
}

/* ---------- 7-day strip on the home page ---------- */
export function Upcoming({ store, goTo }: { store: Store; goTo: (tab: string) => void }) {
  const drag = useDayDrop(store);
  const td = today();
  const next = store.subjects
    .filter((s) => s.kind !== 'course' && s.examDate && s.examDate >= td)
    .sort((a, b) => a.examDate!.localeCompare(b.examDate!))[0];
  return (
    <section className="card">
      <div className="section-head">
        <h2>Upcoming schedule</h2>
        <button className="soft sm" onClick={() => goTo('calendar')}>Calendar <Icon name="right" size={14} /></button>
      </div>
      {next && <Countdown s={next} onClick={() => goTo('subjects')} />}
      <div className="strip">
        {Array.from({ length: 7 }, (_, i) => <DayColumn key={i} store={store} day={addDays(td, i)} compact drag={drag} goTo={goTo} />)}
      </div>
      <p className="muted small" style={{ margin: 0 }}>Tip: hold a task and drag it to another day.</p>
    </section>
  );
}

export function Countdown({ s, onClick }: { s: Subject; onClick?: () => void }) {
  const n = daysBetween(today(), s.examDate!);
  return (
    <button className={'countdown k-' + s.kind} onClick={onClick}>
      <b>{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`}</b>
      <span>until {s.name} {s.kind === 'placement' ? 'placement' : 'exam'} · {fmtShort(s.examDate!)}</span>
    </button>
  );
}

/* ---------- Calendar page ---------- */
export function CalendarPanel({ store, goTo }: { store: Store; goTo: (tab: string) => void }) {
  const td = today();
  const [start, setStart] = useState(startOfWeek(td));
  const drag = useDayDrop(store);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const undated = store.laters.filter((t) => !t.due && !t.remindAt);
  return (
    <div className="page wide">
      <QuickAdd store={store} defaultDay={start <= td && td <= days[6] ? td : start} />
      <section className="card">
        <div className="section-head">
          <h2>{fmtShort(start)} – {fmtShort(days[6])}</h2>
          <div className="actions">
            <button className="icon-btn" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><Icon name="left" /></button>
            <button className="soft sm" onClick={() => setStart(startOfWeek(td))}>This week</button>
            <button className="icon-btn" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><Icon name="right" /></button>
          </div>
        </div>
        <Legend />
        <div className="cal">
          {days.map((day) => <DayColumn key={day} store={store} day={day} drag={drag} goTo={goTo} />)}
        </div>
      </section>
      {undated.length > 0 && (
        <section className="card">
          <div className="section-head"><h2>No date yet</h2><span className="muted small">Drag one onto a day, or tap to set a date.</span></div>
          <div className="list">{undated.map((t) => <div key={t.id} {...drag(t.id)}><TaskRow t={t} store={store} /></div>)}</div>
        </section>
      )}
    </div>
  );
}

/** One-line add for the calendar: title, date, type, optional link. */
function QuickAdd({ store, defaultDay }: { store: Store; defaultDay: string }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [kind, setKind] = useState<Kind>('study');
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const date = day || defaultDay;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (link && !/^https?:\/\//i.test(link)) { toast('Links must start with http:// or https://'); return; }
    await store.actions.add([{ title: title.trim(), due: date, kind, link: link.trim(), est: kind === 'study' ? 30 : 60, wantToday: false }]);
    toast(`Added to ${fmtDay(date)}.`);
    setTitle(''); setLink(''); setShowLink(false);
  };
  return (
    <form className="card quickadd" onSubmit={add}>
      <div className="quick">
        <input aria-label="What" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick add: e.g. TCS NQT online test" />
        <button type="button" className={'icon-btn' + (showLink ? ' on' : '')} aria-label="Add a link" title="Add a link (test, meeting, form)" onClick={() => setShowLink((v) => !v)}><Icon name="link" /></button>
        <button className="round" type="submit" aria-label="Add" disabled={!title.trim()}><Icon name="plus" /></button>
      </div>
      {showLink && <input type="url" aria-label="Link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (test, meeting or form link)" />}
      <div className="pills">
        <label className="pill on"><Icon name="calendar" size={14} /><input type="date" aria-label="Date" value={date} onChange={(e) => setDay(e.target.value)} /></label>
        {KINDS.map((k) => (
          <button type="button" key={k.id} title={k.hint} className={'pill' + (kind === k.id ? ' on' + (k.id !== 'study' ? ' k-' + k.id : '') : '')} onClick={() => setKind(k.id)}>
            <i className={'dot ' + (k.id === 'study' ? 's0' : 'k-' + k.id)} />{k.label}
          </button>
        ))}
      </div>
    </form>
  );
}
