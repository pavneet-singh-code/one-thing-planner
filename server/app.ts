// The whole API. Runs on Vercel (api/index.ts) and locally (server/dev.ts).
import { Hono, type Context, type Next } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { aiEnabled, AiError, breakDown, planDay, planGoal } from './ai.js';
import { pushEnabled, pushPublicKey, runDueReminders, sendToAll } from './push.js';

const app = new Hono().basePath('/api');

/* ---------- helpers ---------- */
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

const bearer = (c: Context) => (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');

class BadRequest extends Error {}
const str = (v: unknown, max: number, field: string, required = false) => {
  if (v == null || v === '') { if (required) throw new BadRequest(`${field} is required`); return ''; }
  if (typeof v !== 'string') throw new BadRequest(`${field} must be text`);
  const s = v.trim();
  if (required && !s) throw new BadRequest(`${field} is required`);
  return s.slice(0, max);
};
const dateStr = (v: unknown, field: string) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest(`${field} must be YYYY-MM-DD`);
  return v;
};
const isoTime = (v: unknown, field: string) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new BadRequest(`${field} must be an ISO date-time`);
  return new Date(v).toISOString();
};
const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const STATUSES = new Set(['later', 'today', 'done']);
const steps = (v: unknown) => {
  if (!Array.isArray(v)) throw new BadRequest('steps must be a list');
  return v.slice(0, 12).map((s) => ({ text: String((s as { text?: unknown })?.text ?? '').slice(0, 160), done: Boolean((s as { done?: unknown })?.done) }));
};

const TASK_COLS = `id, title, subject, due, remind_at as "remindAt", est, status, ord, steps, reminded,
  created_at as "createdAt", done_at as "doneAt"`;

/* ---------- errors ---------- */
app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof AiError) return c.json({ error: err.message }, err.status as 429);
  console.error(err);
  return c.json({ error: 'Server error. Check the server logs.' }, 500);
});

/* ---------- public ---------- */
app.get('/health', (c) => c.json({ ok: true }));

// Cron: hit every minute by cron-job.org (or any scheduler) with the CRON_SECRET.
app.on(['GET', 'POST'], '/cron/reminders', async (c) => {
  const secret = process.env.CRON_SECRET;
  const given = bearer(c) || c.req.query('key') || '';
  if (!secret || !sameSecret(given, secret)) return c.json({ error: 'unauthorized' }, 401);
  return c.json(await runDueReminders());
});

/* ---------- auth: one access key for the single user ---------- */
app.use('*', async (c: Context, next: Next) => {
  const key = process.env.APP_KEY;
  if (!key) {
    if (process.env.VERCEL) return c.json({ error: 'APP_KEY is not set on the server.' }, 500);
    return next(); // local dev without a key
  }
  if (!sameSecret(bearer(c), key)) return c.json({ error: 'Wrong or missing access key.' }, 401);
  return next();
});

/* ---------- state ---------- */
app.get('/state', async (c) => {
  const d = await db();
  const [tasks, focus] = await Promise.all([
    d.q(`select ${TASK_COLS} from tasks where status <> 'done' or done_at > now() - interval '60 days' order by created_at`),
    d.q(`select day, minutes from focus_log order by day desc limit 120`),
  ]);
  return c.json({ tasks, focus, ai: aiEnabled(), push: pushEnabled(), vapidPublicKey: pushPublicKey() });
});

/* ---------- tasks ---------- */
app.post('/tasks', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const list = Array.isArray(b.tasks) ? b.tasks : [b];
  if (list.length > 30) throw new BadRequest('Too many tasks at once');
  const d = await db();
  const out = [];
  for (const raw of list as Record<string, unknown>[]) {
    const id = str(raw.id, 40, 'id', true);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new BadRequest('id has invalid characters');
    const status = STATUSES.has(raw.status as string) ? raw.status : 'later';
    const [row] = await d.q(
      `insert into tasks (id, title, subject, due, remind_at, est, status, ord)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do nothing
       returning ${TASK_COLS}`,
      [id, str(raw.title, 140, 'title', true), str(raw.subject, 40, 'subject'), dateStr(raw.due, 'due'),
       isoTime(raw.remindAt, 'remindAt'), int(raw.est, 5, 600, 30), status, Number(raw.ord) || 0]);
    if (row) out.push(row);
  }
  return c.json({ tasks: out }, 201);
});

app.patch('/tasks/:id', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if ('title' in b) set('title', str(b.title, 140, 'title', true));
  if ('subject' in b) set('subject', str(b.subject, 40, 'subject'));
  if ('due' in b) set('due', dateStr(b.due, 'due'));
  if ('remindAt' in b) { set('remind_at', isoTime(b.remindAt, 'remindAt')); set('reminded', false); }
  if ('est' in b) set('est', int(b.est, 5, 600, 30));
  if ('ord' in b) set('ord', Number(b.ord) || 0);
  if ('steps' in b) set('steps', JSON.stringify(steps(b.steps)));
  if ('status' in b) {
    if (!STATUSES.has(b.status as string)) throw new BadRequest('status must be later, today or done');
    set('status', b.status);
    set('done_at', b.status === 'done' ? new Date().toISOString() : null);
  }
  if (!sets.length) throw new BadRequest('Nothing to update');
  vals.push(c.req.param('id'));
  const [row] = await (await db()).q(`update tasks set ${sets.join(', ')} where id = $${vals.length} returning ${TASK_COLS}`, vals);
  if (!row) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: row });
});

app.delete('/tasks/:id', async (c) => {
  await (await db()).q('delete from tasks where id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

/* ---------- focus log ---------- */
app.post('/focus', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const day = dateStr(b.day, 'day');
  if (!day) throw new BadRequest('day is required');
  const minutes = int(b.minutes, 1, 180, 25);
  const [row] = await (await db()).q(
    `insert into focus_log (day, minutes) values ($1, $2)
     on conflict (day) do update set minutes = focus_log.minutes + excluded.minutes
     returning day, minutes`, [day, minutes]);
  return c.json(row);
});

/* ---------- alarms (focus timer end, works even if the app is closed) ---------- */
app.post('/alarms', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const id = str(b.id, 40, 'id', true);
  const at = isoTime(b.at, 'at');
  if (!at) throw new BadRequest('at is required');
  await (await db()).q(
    `insert into alarms (id, at, title, body) values ($1,$2,$3,$4)
     on conflict (id) do update set at = excluded.at, title = excluded.title, body = excluded.body, sent = false`,
    [id, at, str(b.title, 100, 'title', true), str(b.body, 200, 'body')]);
  return c.json({ ok: true });
});
app.delete('/alarms/:id', async (c) => {
  await (await db()).q('delete from alarms where id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

/* ---------- push subscriptions ---------- */
app.post('/push/subscribe', async (c) => {
  const b = await c.req.json<{ subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }>();
  const s = b.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new BadRequest('Invalid push subscription');
  await (await db()).q(
    `insert into push_subs (endpoint, sub) values ($1, $2) on conflict (endpoint) do update set sub = excluded.sub`,
    [s.endpoint, JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } })]);
  return c.json({ ok: true });
});
app.post('/push/unsubscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: string }>();
  await (await db()).q('delete from push_subs where endpoint = $1', [String(b.endpoint ?? '')]);
  return c.json({ ok: true });
});
app.post('/push/test', async (c) => {
  if (!pushEnabled()) return c.json({ error: 'Push is off: set the VAPID keys on the server.' }, 503);
  return c.json(await sendToAll({ title: 'One Thing', body: 'Notifications work. Reminders will show up like this.', tag: 'test', url: '/' }));
});

/* ---------- AI ---------- */
app.post('/ai/plan-goal', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const today = dateStr(b.today, 'today') ?? new Date().toISOString().slice(0, 10);
  return c.json(await planGoal({
    goal: str(b.goal, 1500, 'goal', true),
    deadline: dateStr(b.deadline, 'deadline') ?? today,
    hoursPerDay: Math.min(12, Math.max(0.5, Number(b.hoursPerDay) || 2)),
    today,
  }));
});

app.post('/ai/plan-day', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const tasks = await (await db()).q<{ id: string; title: string; subject: string; due: string | null; est: number }>(
    `select id, title, subject, due, est from tasks where status <> 'done' order by coalesce(due, '9999-12-31'), created_at limit 60`);
  if (!tasks.length) throw new BadRequest('Add some tasks first.');
  return c.json(await planDay({
    today: dateStr(b.today, 'today') ?? new Date().toISOString().slice(0, 10),
    hours: Math.min(14, Math.max(0.5, Number(b.hours) || 3)),
    tasks,
  }));
});

app.post('/ai/breakdown', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const [t] = await (await db()).q<{ title: string; subject: string }>('select title, subject from tasks where id = $1', [String(b.taskId ?? '')]);
  if (!t) return c.json({ error: 'Task not found' }, 404);
  return c.json(await breakDown(t));
});

export default app;
