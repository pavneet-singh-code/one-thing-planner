# One Thing: study planner

A study planner that keeps you on **one task at a time**. You get one "Now" task with a 25/5 focus timer, at most three tasks for today, and everything else parked in "Later". Gemini breaks big goals into small tasks, picks today's three, and splits a task into tiny steps when you're stuck. Reminders arrive as phone notifications even when the app is closed.

## Stack

| Part | What | Free tier |
|---|---|---|
| Frontend | React 19 + Vite, installable PWA (`vite-plugin-pwa`, custom service worker in `src/sw.ts`) | Vercel |
| API | Hono (TypeScript), one Vercel function at `api/index.ts`, routes in `server/app.ts` | Vercel |
| Database | Postgres (Neon recommended). Tables are created automatically on first request. | Neon |
| AI | Gemini via `@google/genai`, server-side only (`server/ai.ts`) | Google AI Studio |
| Reminders | Web Push (`web-push`, VAPID). cron-job.org calls `/api/cron/reminders` every minute. | cron-job.org |

```
Phone (PWA) ──HTTPS + access key──▶ Vercel /api ──▶ Postgres (Neon)
     ▲                                   │  └──────▶ Gemini
     └──── Web Push (via Google FCM) ◀───┘
cron-job.org ──every minute──▶ /api/cron/reminders
```

There is no login. Instead, one secret **access key** (`APP_KEY`) protects the API. You type it once per device and it's stored on that device.

## Run locally

```bash
npm install
cp .env.example .env      # then fill in APP_KEY (any random string) and VAPID keys (npm run vapid)
npm run dev               # web on http://localhost:5173, API on :8787
```

Leave `DATABASE_URL` empty locally and an embedded Postgres (PGlite) stores data in `./.data/`. Leave `GEMINI_API_KEY` empty and the AI features show as off.

## Deploy (about 15 minutes)

1. **Database:** create a free project at [neon.tech](https://neon.tech). Copy the **pooled** connection string.
2. **Gemini key:** go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create an API key.
3. **VAPID keys:** run `npm run vapid` and copy the public and private keys.
4. **GitHub:** push this folder to a private GitHub repo.
5. **Vercel:** import the repo at [vercel.com/new](https://vercel.com/new). Vercel picks up the settings from `vercel.json`. Add these Environment Variables:
   `APP_KEY`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` (optional), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + your email), `CRON_SECRET`.
   Then deploy.
6. **Cron:** at [cron-job.org](https://cron-job.org), create a job:
   - URL: `https://<your-app>.vercel.app/api/cron/reminders?key=<CRON_SECRET>`
   - Schedule: every 1 minute
7. **Phone:**
   1. Open the URL in **Chrome** on Android, enter your access key, then ⋮ → **Install app**.
   2. In the app, open **Settings → Turn on notifications**, then **Send a test**.

## Notes

- **Gemini free tier:** it has rate limits, and Google may use free-tier prompts to improve its models. If the default model is retired, set `GEMINI_MODEL` to the current Flash model listed in AI Studio.
- **Missed reminders:** if the cron is down, reminders older than 6 hours are skipped rather than sent all at once.
- **Timer alarms:** the focus timer registers an alarm on the server, so the phone is notified when a session ends even if the app is closed. Accuracy is about one minute because of the cron interval.
- **Battery settings:** Android battery saver can delay notifications. If reminders arrive late, set Chrome's battery usage to "Unrestricted".

## Project layout

```
api/index.ts          Vercel entry (forwards to Hono)
server/app.ts         All API routes + validation + access-key auth
server/db.ts          Postgres / PGlite + schema
server/ai.ts          Gemini prompts (plan goal, plan day, break down)
server/push.ts        Web Push sending + due-reminder job
server/dev.ts         Local API server
src/                  React app (App.tsx, store.ts, components/, sw.ts)
scripts/icons.mjs     Renders PWA icons (npm run icons)
prototype/            The first single-file version (not used by the app)
```
