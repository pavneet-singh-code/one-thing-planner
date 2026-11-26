// Gemini calls. The API key never leaves the server.
import { GoogleGenAI } from '@google/genai';

export class AiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;
export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
async function askJson<T>(prompt: string | Part[], schema: object): Promise<T> {
  if (!aiEnabled()) throw new AiError('AI is off: set GEMINI_API_KEY on the server.', 503);
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, apiVersion: 'v1beta' }); // JSON mode needs v1beta
  let text: string | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await client.models.generateContent({
        model: model(),
        contents: typeof prompt === 'string' ? prompt : [{ role: 'user', parts: prompt }],
        config: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.4 },
      });
      text = r.text;
      break;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // Gemini is often briefly overloaded; retry those once or twice.
      if (attempt < 3 && /\b(500|503)\b|UNAVAILABLE|overloaded|INTERNAL|fetch failed|ECONNRESET/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new AiError('Gemini free-tier limit reached. Wait a minute and try again.', 429);
      if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) throw new AiError('Gemini rejected the API key. Check GEMINI_API_KEY.', 502);
      if (/not found|404/i.test(msg)) throw new AiError(`Gemini model "${model()}" was not found. Set GEMINI_MODEL to a current model.`, 502);
      console.error('[ai]', e);
      throw new AiError(`Gemini request failed: ${detail(msg)}`);
    }
  }
  try {
    return JSON.parse(text ?? '') as T;
  } catch {
    throw new AiError('Gemini returned an unreadable answer. Try again.');
  }
}

const COACH = 'You are a study coach for a student who tends to start too many things and finish none. Keep everything concrete and small.';

export interface PlannedTask { title: string; date: string; minutes: number; kind?: string }

const KIND_RULE = '"kind" is "study" for normal study work. Use "exam", "placement" or "deadline" only for the actual exam, placement test/interview or submission itself (not for preparing for it).';
const TASKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD' },
      minutes: { type: 'integer' },
      kind: { type: 'string', enum: ['study', 'exam', 'placement', 'deadline'] },
    },
    required: ['title', 'date', 'minutes'],
  },
};
const KINDS = new Set(['study', 'exam', 'placement', 'deadline']);
function normTasks(raw: PlannedTask[] | undefined, max: number) {
  return (raw ?? [])
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, max)
    .map((t) => ({
      title: t.title.trim().slice(0, 140),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '',
      minutes: clampInt(t.minutes, 5, 240, 30),
      kind: KINDS.has(t.kind ?? '') ? t.kind! : 'study',
    }));
}
export async function planGoal(p: { goal: string; deadline: string; hoursPerDay: number; today: string; pdf?: string }) {
  const prompt = `${COACH}
Today is ${p.today} (${weekdayOf(p.today)}). Deadline: ${p.deadline} (${weekdayOf(p.deadline)}). Default time budget: about ${p.hoursPerDay} hours per day.
Goal, in the student's own words (between the markers). Anything they say about timing, breaks, days off or how to group work OVERRIDES the default time budget:
<<<
${p.goal}
>>>
${p.pdf ? 'A PDF is attached (a syllabus, brief, notes or similar). Base the tasks on what is actually in it: name its units, chapters, questions or requirements in the task titles.\n' : ''}${calendar(p.today, p.deadline)}
Make a plan:
- Each task fits one sitting (15-90 minutes), starts with a verb, and says exactly what to do (which chapter, how many problems, which tool to try...). Under 90 characters. Be specific to this goal, not generic.
- Use only dates from the calendar above, on or before the deadline. Several tasks may share a day and some days can be empty.
- Unless the goal says otherwise, stay near the default time budget per day.
- Include a review / practice-test (or for projects, a check-in or demo) task near the end. At most 30 tasks.
- ${KIND_RULE}
- Fill "rules" first: the concrete scheduling rules you followed, in short phrases (e.g. "Finish by Nov 30", "About 30 min a day").
- "summary" is one sentence on the strategy.${p.pdf ? '\n- "docNotes": the key contents of the PDF the plan relies on (units/topics/requirements, dates), as a compact list under 1200 characters. It will be reused when the student asks for changes.' : ''}`;
  const parts: Part[] = p.pdf ? [{ inlineData: { mimeType: 'application/pdf', data: p.pdf } }, { text: prompt }] : [{ text: prompt }];
  const r = await askJson<{ rules?: string[]; summary?: string; docNotes?: string; tasks?: PlannedTask[] }>(parts, {
    type: 'object',
    properties: { rules: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, tasks: TASKS_SCHEMA, ...(p.pdf ? { docNotes: { type: 'string' } } : {}) },
    required: ['rules', 'summary', 'tasks'],
  });
  const tasks = normTasks(r.tasks, 30);
  if (!tasks.length) throw new AiError('Gemini did not suggest any tasks. Try describing the goal in more detail.');
  return { summary: String(r.summary ?? ''), rules: cleanRules(r.rules), docNotes: String(r.docNotes ?? '').slice(0, 1500), tasks };
}

export async function readSyllabus(p: { pdf: string; text: string; subject: string; kind: string; examDate: string | null; hoursPerDay: number; today: string; plan: boolean }) {
  const end = p.examDate ?? addDaysIso(p.today, 21);
  const focus = p.kind === 'placement'
    ? 'This is placement preparation (aptitude, reasoning, verbal, technical rounds, interviews). Favour timed practice sets, previous-year style questions and mock tests.'
    : p.kind === 'exam' ? 'This is an exam. Cover every topic once, then revise and do practice papers before the exam.' : '';
  const prompt = `${COACH}
Today is ${p.today}. ${p.examDate ? `The ${p.kind === 'placement' ? 'placement test / drive' : 'exam'} is on ${p.examDate}.` : `Aim to finish by ${end}.`} Available: about ${p.hoursPerDay} hours per day.
Subject: "${p.subject}". ${focus}
${p.pdf ? 'The attached PDF is the syllabus.' : `Syllabus text (between the markers):
<<<
${p.text}
>>>`}
1. "topics": list the syllabus topics in order, as short names (under 60 characters each, at most 40). Merge tiny sub-points into their topic.
${p.plan ? `2. "tasks": a study plan from today to the day before ${end}. Each task is doable in one sitting (15-90 minutes), starts with a verb, names the topic and says exactly what to do. Under 90 characters. Never more than ${p.hoursPerDay} hours on one day. Leave room for revision of earlier topics and at least one full practice test near the end. At most 40 tasks. ${KIND_RULE}
3. "summary": one sentence on the strategy.` : '2. "tasks": an empty list. "summary": one sentence describing the syllabus.'}`;
  const parts: Part[] = p.pdf ? [{ inlineData: { mimeType: 'application/pdf', data: p.pdf } }, { text: prompt }] : [{ text: prompt }];
  const r = await askJson<{ topics?: string[]; summary?: string; tasks?: PlannedTask[] }>(parts, {
    type: 'object',
    properties: {
      topics: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      tasks: TASKS_SCHEMA,
    },
    required: ['topics', 'summary', 'tasks'],
  });
  const topics = (r.topics ?? []).map(String).map((s) => s.trim().slice(0, 160)).filter(Boolean).slice(0, 80);
  if (!topics.length) throw new AiError('Gemini could not find any topics in that syllabus. Is the PDF a scan? Try pasting the text instead.');
  const tasks = normTasks(r.tasks, 50);
  return { topics, summary: String(r.summary ?? ''), tasks };
}

/**
 * Revise a plan from a follow-up request. Every earlier request is still a rule (not "done and forgotten");
 * when two rules conflict the newer one wins, and rules beat the default time budget.
 */
export async function refinePlan(p: {
  instruction: string; tasks: PlannedTask[]; today: string; deadline: string | null; hoursPerDay: number | null; context: string; history: string[];
}) {
  const rules = [...p.history, p.instruction];
  const lastDate = p.tasks.map((t) => t.date).filter(Boolean).sort().at(-1) ?? p.today;
  const end = p.deadline && p.deadline > lastDate ? p.deadline : lastDate > p.today ? lastDate : addDaysIso(p.today, 28);
  const prompt = `${COACH}
Today is ${p.today} (${weekdayOf(p.today)}).
${p.context ? `What this plan is for (between the markers):\n<<<\n${p.context}\n>>>` : ''}
Default settings (lowest priority, only when no rule says otherwise):${p.deadline ? ` finish by ${p.deadline} (${weekdayOf(p.deadline)});` : ''}${p.hoursPerDay ? ` about ${p.hoursPerDay} hours per day;` : ''} tasks of 15-90 minutes.

The student's rules for this plan, oldest first. ALL of them still apply, not just the last one. If two rules conflict, the later one wins only on the point where they conflict; keep the rest of the earlier rule. Rules always beat the default settings (for example, putting several tasks on one day is fine if a rule asks to group work, even if that day goes over the default hours).
${rules.map((r, i) => `${i + 1}. ${i === rules.length - 1 ? '(newest) ' : ''}<<<${r}>>>`).join('\n')}

${calendar(p.today, end)}
Current plan (JSON, one object per task): ${JSON.stringify(p.tasks)}

Rewrite the plan so it satisfies every rule at once:
1. First fill "rules": restate each of the student's rules as a short, concrete constraint you are applying, merged where they overlap (for example "Rest 2 days after each work day, so work days are: <the actual dates>", "Nothing after <deadline>", "No tasks on Sundays", "Group 2-3 tasks per work day"). This list is shown to the student so they can see what you remembered.
2. Then "tasks": the complete revised plan. Use dates from the calendar above. Several tasks may share a day. Keep a task's title, minutes and kind unless a rule needs them changed. Keep the same work unless a rule asks to add or drop work. Titles start with a verb and stay under 90 characters. At most 50 tasks. ${KIND_RULE}
3. "summary": one short sentence saying what changed.
Before answering, check every task date against every rule (rest days, weekends, deadline) and fix any that break one.`;
  const r = await askJson<{ rules?: string[]; summary?: string; tasks?: PlannedTask[] }>(prompt, {
    type: 'object',
    properties: { rules: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, tasks: TASKS_SCHEMA },
    required: ['rules', 'summary', 'tasks'],
  });
  const tasks = normTasks(r.tasks, 50);
  if (!tasks.length) throw new AiError('Gemini returned an empty plan. Try rephrasing your request.');
  return { summary: String(r.summary ?? ''), rules: cleanRules(r.rules), tasks };
}

/** "2026-11-18 Wed" lines from `from` to `to` (max 70 days), so the model never has to do date maths. */
function calendar(from: string, to: string) {
  const out: string[] = [];
  for (let d = from, i = 0; d <= to && i < 70; d = addDaysIso(d, 1), i++) out.push(`${d} ${weekdayOf(d)}`);
  return `Calendar (date and weekday), today to the end:\n${out.join(', ')}`;
}
function weekdayOf(s: string) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(s + 'T12:00:00Z').getUTCDay()];
}
const cleanRules = (r: unknown) => (Array.isArray(r) ? r.map(String).map((x) => x.trim().slice(0, 160)).filter(Boolean).slice(0, 10) : []);

function addDaysIso(s: string, n: number) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function planDay(p: { today: string; hours: number; tasks: { id: string; title: string; subject: string; due: string | null; est: number }[] }) {
  const prompt = `${COACH}
Today is ${p.today}. The student has about ${p.hours} hours today.
Open tasks (JSON): ${JSON.stringify(p.tasks.map((t) => ({ id: t.id, title: t.title, subject: t.subject || undefined, due: t.due || undefined, minutes: t.est })))}
Pick at most 3 tasks (fewer if time is short) that fit in the time. Prioritise overdue and soonest-due work, then balance subjects. Order them: first = do first.
"why" is under 15 words. "advice" is one short encouraging sentence.`;
  const r = await askJson<{ pick?: { id: string; why: string }[]; advice?: string }>(prompt, {
    type: 'object',
    properties: {
      pick: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } },
      advice: { type: 'string' },
    },
    required: ['pick', 'advice'],
  });
  const ids = new Set(p.tasks.map((t) => t.id));
  const pick = (r.pick ?? []).filter((x) => x && ids.has(String(x.id))).slice(0, 3).map((x) => ({ id: String(x.id), why: String(x.why ?? '') }));
  if (!pick.length) throw new AiError('Gemini could not pick tasks. Try again.');
  return { pick, advice: String(r.advice ?? '') };
}

export async function breakDown(p: { title: string; subject: string }) {
  const prompt = `${COACH}
The student is stuck starting this task: "${p.title}"${p.subject ? ` (subject: ${p.subject})` : ''}.
Break it into 3 to 6 tiny steps, each doable in 5-15 minutes, starting with the easiest possible first step so they can begin right now. Each step under 80 characters, starting with a verb.`;
  const r = await askJson<{ steps?: string[] }>(prompt, {
    type: 'object',
    properties: { steps: { type: 'array', items: { type: 'string' } } },
    required: ['steps'],
  });
  const steps = (r.steps ?? []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  if (!steps.length) throw new AiError('Gemini returned no steps. Try again.');
  return { steps };
}

// Pull the human-readable "message" out of Gemini's JSON error, never echoing the key.
function detail(msg: string) {
  const m = /"message"\s*:\s*"([^"]+)"/.exec(msg);
  return (m ? m[1] : msg).replace(/key=[^&\s"]+/gi, 'key=…').slice(0, 200);
}

function clampInt(v: unknown, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
