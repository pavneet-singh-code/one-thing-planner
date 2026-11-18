import { useEffect, useRef, useState } from 'react';
import { api, newId, type Subject, type SubjectKind, type Topic } from '../api';
import { daysBetween, fmtDay, today } from '../dates';
import { SUBJECT_KINDS } from '../kinds';
import { toast, type Store } from '../store';
import { subjectClass } from '../subjects';
import { Icon } from './Icon';
import { checkLinks, fromAi, keepers, PlanReview, toFields, type Plan } from './Proposal';
import { useEditor } from './TaskEditor';
import { TaskRow } from './Tasks';

const MAX_PDF = 3 * 1024 * 1024;
const blank = (name = ''): Subject => ({ id: '', name, kind: 'exam', examDate: null, topics: [], fileName: '' });

/** Subjects from the subjects table plus any subject names that only exist on tasks. */
function allSubjects(store: Store): Subject[] {
  const known = new Set(store.subjects.map((s) => s.name));
  const extra = [...new Set(store.tasks.map((t) => t.subject).filter((n) => n && !known.has(n)))].map((n) => ({ ...blank(n), kind: 'course' as const }));
  return [...store.subjects, ...extra];
}

function stats(store: Store, s: Subject) {
  const tasks = store.tasks.filter((t) => t.subject === s.name && t.kind === 'study');
  const done = tasks.filter((t) => t.status === 'done').length;
  const td = today();
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due && t.due < td).length;
  const minsLeft = tasks.filter((t) => t.status !== 'done').reduce((a, t) => a + t.est, 0);
  const topicsDone = s.topics.filter((t) => t.done).length;
  return { total: tasks.length, done, overdue, minsLeft, topicsDone };
}

const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/* ---------- page ---------- */
export function SubjectsPanel({ store }: { store: Store }) {
  const [open, setOpen] = useState<Subject | null>(null);
  const list = allSubjects(store);
  const td = today();
  const sorted = [...list].sort((a, b) => (a.examDate && a.examDate >= td ? a.examDate : '9999').localeCompare(b.examDate && b.examDate >= td ? b.examDate : '9999') || a.name.localeCompare(b.name));

  return (
    <div className="page wide">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="muted small" style={{ margin: 0 }}>Upload a syllabus, set the exam or placement date, and track progress.</p>
        </div>
        <button className="primary" onClick={() => setOpen(blank())}><Icon name="plus" size={16} /> Add subject</button>
      </div>

      {!sorted.length && (
        <div className="card empty-card">
          <Icon name="book" size={28} />
          <h2>No subjects yet</h2>
          <p className="muted" style={{ margin: 0 }}>Add one for each exam or placement you’re preparing for (e.g. “NALR”, “TCS NQT”, “DBMS”). Upload its syllabus PDF and the AI turns it into a topic checklist and a study plan.</p>
          <div className="actions"><button className="primary" onClick={() => setOpen(blank())}>Add your first subject</button></div>
        </div>
      )}

      <div className="subject-grid">
        {sorted.map((s) => {
          const st = stats(store, s);
          const days = s.examDate ? daysBetween(td, s.examDate) : null;
          const pctT = st.total ? Math.round((st.done / st.total) * 100) : 0;
          const pctP = s.topics.length ? Math.round((st.topicsDone / s.topics.length) * 100) : 0;
          return (
            <button key={s.id || s.name} className={'card subject-card ' + subjectClass(s.name)} onClick={() => setOpen(s)}>
              <div className="subject-top">
                <span className="subject-name"><i className={'dot ' + subjectClass(s.name)} />{s.name}</span>
                <span className={'tag k-' + (s.kind === 'course' ? 'none' : s.kind)}>{SUBJECT_KINDS.find((k) => k.id === s.kind)?.label}</span>
              </div>
              {days != null && (
                <div className={'subject-when' + (days < 0 ? ' past' : days <= 7 ? ' soon' : '')}>
                  <b>{days < 0 ? 'Done' : days === 0 ? 'Today' : days}</b>
                  <span>{days < 0 ? `was on ${fmtDay(s.examDate!)}` : days === 0 ? fmtDay(s.examDate!) : `day${days === 1 ? '' : 's'} left · ${fmtDay(s.examDate!)}`}</span>
                </div>
              )}
              <div className="meter">
                <div className="meter-top"><span>Tasks</span><b>{st.done}/{st.total}</b></div>
                <div className="track"><div style={{ width: `${pctT}%` }} /></div>
              </div>
              <div className="meter">
                <div className="meter-top"><span>Syllabus topics</span><b>{s.topics.length ? `${st.topicsDone}/${s.topics.length}` : 'none yet'}</b></div>
                <div className="track"><div style={{ width: `${pctP}%` }} /></div>
              </div>
              <div className="meta">
                {st.minsLeft > 0 && <span className="chip"><Icon name="clock" size={13} />{fmtMins(st.minsLeft)} planned</span>}
                {st.overdue > 0 && <span className="chip due-over">{st.overdue} overdue</span>}
                {s.fileName && <span className="chip"><Icon name="book" size={13} />{s.fileName}</span>}
                {!s.id && <span className="chip">Tap to set up</span>}
              </div>
            </button>
          );
        })}
      </div>

      {open && <SubjectSheet key={open.id || open.name || 'new'} store={store} subject={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------- add / edit sheet ---------- */
function SubjectSheet({ store, subject, onClose }: { store: Store; subject: Subject; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const edit = useEditor();
  const isNew = !subject.id;
  const [name, setName] = useState(subject.name);
  const [kind, setKind] = useState<SubjectKind>(subject.kind);
  const [examDate, setExamDate] = useState(subject.examDate ?? '');
  const [topics, setTopics] = useState<Topic[]>(subject.topics);
  const [fileName, setFileName] = useState(subject.fileName);
  const [newTopic, setNewTopic] = useState('');

  const [pdf, setPdf] = useState<{ name: string; data: string } | null>(null);
  const [paste, setPaste] = useState('');
  const [hours, setHours] = useState(2);
  const [wantPlan, setWantPlan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const close = () => ref.current?.close();
  const tasks = store.tasks.filter((t) => t.subject === subject.name && subject.name);
  const ai = store.state?.ai;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { toast('Pick a PDF file.'); return; }
    if (f.size > MAX_PDF) { toast('That PDF is over 3 MB. Upload just the syllabus pages, or paste the text.'); return; }
    const r = new FileReader();
    r.onload = () => setPdf({ name: f.name, data: String(r.result).split(',')[1] ?? '' });
    r.onerror = () => toast('Could not read that file.');
    r.readAsDataURL(f);
  };

  const read = async (fromTopics = false) => {
    if (!name.trim()) { toast('Give the subject a name first.'); return; }
    const text = fromTopics ? topics.map((t) => '- ' + t.title).join('\n') : paste.trim();
    if (!fromTopics && !pdf && !text) { toast('Upload the syllabus PDF or paste its text.'); return; }
    setBusy(true); setPlan(null);
    try {
      const r = await api.readSyllabus({
        pdf: fromTopics ? undefined : pdf?.data, text: fromTopics || !pdf ? text : undefined,
        subject: name.trim(), kind, examDate: examDate || null, hoursPerDay: hours, today: today(), plan: fromTopics || wantPlan,
      });
      if (!fromTopics) {
        // keep ticks on topics that already existed
        const doneSet = new Set(topics.filter((t) => t.done).map((t) => t.title.toLowerCase()));
        setTopics(r.topics.map((title) => ({ title, done: doneSet.has(title.toLowerCase()) })));
        if (pdf) setFileName(pdf.name);
      }
      if (r.tasks.length) setPlan({ summary: r.summary, tasks: fromAi(r.tasks, { subject: name.trim(), time: '17:00' }) });
      toast(fromTopics ? 'Plan ready. Check it below.' : `Found ${r.topics.length} topics.`);
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  const toSubject = (): Subject => ({ id: subject.id || newId(), name: name.trim(), kind, examDate: examDate || null, topics, fileName });

  const save = async () => {
    if (!name.trim()) { toast('Give the subject a name.'); return; }
    if (plan && !checkLinks(plan.tasks)) return;
    const s = toSubject();
    try { await store.actions.saveSubject(s); } catch { return; }
    const kept = plan ? keepers(plan.tasks) : [];
    if (kept.length) {
      await store.actions.add(kept.map((t) => ({ ...toFields(t), subject: t.subject.trim() || s.name })));
    }
    toast(kept.length ? `Saved, and added ${kept.length} tasks.` : 'Saved.');
    close();
  };

  /** Ticking a topic on a saved subject saves straight away. */
  const setTopicsNow = (next: Topic[]) => {
    setTopics(next);
    if (!isNew && !plan) store.actions.saveSubject({ ...toSubject(), topics: next }).catch(() => {});
  };

  return (
    <dialog ref={ref} className="sheet wide" onClose={onClose} onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2><i className={'dot big ' + subjectClass(name)} />{isNew ? (subject.name ? `Set up ${subject.name}` : 'New subject') : name || 'Subject'}</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button>
        </div>

        <div className="grid">
          <label className="f wide">Name<input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NALR, TCS NQT, DBMS" autoFocus={isNew && !subject.name} /></label>
          <label className="f wide">{kind === 'placement' ? 'Drive / test date' : kind === 'exam' ? 'Exam date' : 'Finish by'}
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
        </div>
        <div className="f"><span>Type</span>
          <div className="seg">
            {SUBJECT_KINDS.map((k) => <button type="button" key={k.id} className={kind === k.id ? 'on' + (k.id !== 'course' ? ' k-' + k.id : '') : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>
        </div>

        {/* syllabus */}
        <section className="box">
          <h3><Icon name="book" size={16} /> Syllabus</h3>
          {!ai && <p className="note">AI is off on the server, so PDFs can’t be read. You can still type topics below.</p>}
          {ai && (
            <>
              <label className={'drop' + (pdf ? ' has' : '')}>
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0])} />
                <Icon name="upload" size={22} />
                <span>{pdf ? pdf.name : fileName ? `Replace syllabus (now: ${fileName})` : 'Upload syllabus PDF'}</span>
                <small className="muted">PDF up to 3 MB · text-based PDFs work best</small>
              </label>
              <details>
                <summary className="muted small">or paste the syllabus text</summary>
                <textarea maxLength={8000} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Unit 1: Percentages…" style={{ marginTop: 8 }} />
              </details>
              <div className="inline-form">
                <label className="f" style={{ flex: '0 1 140px' }}>Hours / day<input type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 2)} /></label>
                <label className="check-line" style={{ flex: '1 1 200px', paddingBottom: 10 }}><input type="checkbox" checked={wantPlan} onChange={(e) => setWantPlan(e.target.checked)} />Also make a study plan{examDate ? ` until ${fmtDay(examDate)}` : ''}</label>
              </div>
              <div className="actions">
                <button className="primary" disabled={busy || (!pdf && !paste.trim())} onClick={() => read(false)}>
                  <Icon name="sparkle" size={16} />{busy ? 'Reading… (up to a minute)' : 'Read syllabus'}
                </button>
                {topics.length > 0 && <button className="soft" disabled={busy} onClick={() => read(true)}>Plan from my topics</button>}
              </div>
            </>
          )}
        </section>

        {/* topics */}
        <section className="box">
          <div className="section-head">
            <h3>Topics</h3>
            {topics.length > 0 && <span className="muted small">{topics.filter((t) => t.done).length}/{topics.length} covered</span>}
          </div>
          {topics.length > 0 && <div className="track big"><div style={{ width: `${(topics.filter((t) => t.done).length / topics.length) * 100}%` }} /></div>}
          <ul className="steps edit">
            {topics.map((t, i) => (
              <li key={i} className={t.done ? 'd' : ''}>
                <input type="checkbox" aria-label="Covered" checked={t.done} onChange={(e) => setTopicsNow(topics.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                <input className="bare" maxLength={160} value={t.title} onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <button className="icon-btn" aria-label="Plan a task for this topic" title="Add a task for this topic"
                  onClick={() => { close(); edit({ preset: { title: `Study ${t.title}`.slice(0, 140), subject: name.trim(), due: today() } }); }}><Icon name="plus" size={16} /></button>
                <button className="icon-btn" aria-label="Remove topic" onClick={() => setTopics(topics.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
              </li>
            ))}
            <li>
              <Icon name="plus" size={16} className="muted" />
              <input className="bare" maxLength={160} value={newTopic} placeholder="Add a topic and press Enter" onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTopic.trim()) { e.preventDefault(); setTopics([...topics, { title: newTopic.trim(), done: false }]); setNewTopic(''); } }} />
            </li>
          </ul>
        </section>

        {plan && (
          <section className="box">
            <h3><Icon name="sparkle" size={16} /> Proposed plan</h3>
            <PlanReview plan={plan} setPlan={setPlan} store={store}
              context={{ text: `${kind === 'placement' ? 'Placement preparation' : kind === 'exam' ? 'Exam preparation' : 'Course'} for "${name.trim()}". Syllabus topics: ${topics.map((t) => t.title).join('; ')}`.slice(0, 1500), deadline: examDate || null, hoursPerDay: hours }} />
            <p className="muted small" style={{ margin: 0 }}>These are added when you press Save.</p>
          </section>
        )}

        {!isNew && tasks.length > 0 && (
          <section className="box">
            <div className="section-head"><h3>Tasks</h3><span className="muted small">{tasks.filter((t) => t.status === 'done').length}/{tasks.length} done</span></div>
            <div className="list">{tasks.slice(0, 40).map((t) => <TaskRow key={t.id} t={t} store={store} />)}</div>
          </section>
        )}

        <div className="sheet-foot">
          {!isNew && (confirmDel
            ? <button className="soft danger" onClick={() => { store.actions.deleteSubject(subject); close(); }}>Delete subject? (tasks stay)</button>
            : <button className="icon-btn danger" aria-label="Delete subject" onClick={() => setConfirmDel(true)}><Icon name="trash" /></button>)}
          <button className="primary" disabled={!name.trim() || busy} onClick={save}>
            {plan && keepers(plan.tasks).length ? `Save + add ${keepers(plan.tasks).length} tasks` : 'Save'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

