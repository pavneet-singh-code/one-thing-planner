// Database access. In production DATABASE_URL points at Postgres (Neon, Supabase, ...).
// Without it (local dev) an embedded Postgres (PGlite) stores data in ./.data/pglite.

export type Row = Record<string, unknown>;
export interface Db {
  q<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = `
create table if not exists tasks (
  id          text primary key,
  title       text not null,
  subject     text not null default '',
  due         text,                       -- YYYY-MM-DD in the user's local calendar
  remind_at   timestamptz,
  est         integer not null default 30,
  status      text not null default 'later' check (status in ('later','today','done')),
  ord         double precision not null default 0,
  steps       jsonb not null default '[]'::jsonb,
  reminded    boolean not null default false,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists tasks_remind_idx on tasks (remind_at) where reminded = false;

create table if not exists focus_log (
  day      text primary key,              -- YYYY-MM-DD local
  minutes  integer not null default 0
);

create table if not exists push_subs (
  endpoint    text primary key,
  sub         jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists alarms (
  id      text primary key,
  at      timestamptz not null,
  title   text not null,
  body    text not null default '',
  sent    boolean not null default false
);
`;

let opening: Promise<Db> | null = null;
export function db(): Promise<Db> {
  opening ??= open().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let d: Db;
  if (url) {
    const { default: postgres } = await import('postgres');
    // prepare:false keeps it compatible with transaction-mode poolers (Neon/Supabase).
    const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, onnotice: () => {} });
    d = { q: async (text, params = []) => (await sql.unsafe(text, params as never[])) as never };
    await sql.unsafe(SCHEMA);
  } else {
    if (process.env.VERCEL) throw new Error('DATABASE_URL is not set');
    const { PGlite } = await import('@electric-sql/pglite');
    (await import('node:fs')).mkdirSync('./.data', { recursive: true });
    const pg = new PGlite('./.data/pglite');
    await pg.exec(SCHEMA);
    d = { q: async (text, params = []) => (await pg.query(text, params)).rows as never };
    console.log('[db] using embedded PGlite at ./.data/pglite');
  }
  return d;
}
