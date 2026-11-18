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

async function askJson<T>(prompt: string, schema: object): Promise<T> {
  if (!aiEnabled()) throw new AiError('AI is off: set GEMINI_API_KEY on the server.', 503);
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let text: string | undefined;
  try {
    const r = await client.models.generateContent({
      model: model(),
      contents: prompt,
      config: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.4 },
    });
    text = r.text;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new AiError('Gemini free-tier limit reached. Wait a minute and try again.', 429);
    if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) throw new AiError('Gemini rejected the API key. Check GEMINI_API_KEY.', 502);
    if (/not found|404/i.test(msg)) throw new AiError(`Gemini model "${model()}" was not found. Set GEMINI_MODEL to a current model.`, 502);
    console.error('[ai]', e);
    throw new AiError('Gemini request failed. Try again.');
  }
  try {
    return JSON.parse(text ?? '') as T;
  } catch {
    throw new AiError('Gemini returned an unreadable answer. Try again.');
  }
}

const COACH = 'You are a study coach for a student who tends to start too many things and finish none. Keep everything concrete and small.';

export interface PlannedTask { title: string; date: string; minutes: number }
export async function planGoal(p: { goal: string; deadline: string; hoursPerDay: number; today: string }) {
  const prompt = `${COACH}
Today is ${p.today}. Deadline: ${p.deadline}. Available: about ${p.hoursPerDay} hours per day.
Goal: """${p.goal}"""
Break the goal into study tasks:
- Each task is doable in one sitting (15-90 minutes), starts with a verb, and says exactly what to do (which chapter, how many problems, etc.). Under 90 characters.
- Spread tasks from today to the day before the deadline; never more than ${p.hoursPerDay} hours on one day.
- Include at least one review or practice-test task near the end. At most 14 tasks.
- "summary" is one sentence on the strategy.`;
  const r = await askJson<{ summary?: string; tasks?: PlannedTask[] }>(prompt, {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, minutes: { type: 'integer' } },
          required: ['title', 'date', 'minutes'],
        },
      },
    },
    required: ['summary', 'tasks'],
  });
  const tasks = (r.tasks ?? [])
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, 20)
    .map((t) => ({
      title: t.title.trim().slice(0, 140),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '',
      minutes: clampInt(t.minutes, 5, 240, 30),
    }));
  if (!tasks.length) throw new AiError('Gemini did not suggest any tasks. Try describing the goal in more detail.');
  return { summary: String(r.summary ?? ''), tasks };
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

function clampInt(v: unknown, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
