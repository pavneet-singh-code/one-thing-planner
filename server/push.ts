// Web Push: storing subscriptions and sending due reminders / alarms.
import * as webpush from 'web-push';
import { db } from './db.js';

let configured = false;
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';
export const pushEnabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushMessage { title: string; body: string; tag?: string; url?: string }

/** Send to every saved device. Removes subscriptions the push service says are gone. */
export async function sendToAll(msg: PushMessage) {
  if (!pushEnabled()) return { sent: 0, failed: 0, devices: 0 };
  configure();
  const d = await db();
  const subs = await d.q<{ endpoint: string; sub: webpush.PushSubscription }>('select endpoint, sub from push_subs');
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 60 * 60, urgency: 'high' });
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await d.q('delete from push_subs where endpoint = $1', [s.endpoint]);
      else console.error('[push]', code, (e as Error).message);
    }
  }));
  return { sent, failed, devices: subs.length };
}

/**
 * Called every minute by an external cron. Sends reminders that are due.
 * Reminders older than 6 hours (e.g. cron was down) are marked done silently instead of spamming.
 */
export async function runDueReminders() {
  const d = await db();
  await d.q(`update tasks set reminded = true where reminded = false and remind_at < now() - interval '6 hours'`);
  await d.q(`update alarms set sent = true where sent = false and at < now() - interval '1 hour'`);
  const due = await d.q<{ id: string; title: string; subject: string; est: number }>(
    `update tasks set reminded = true
       where reminded = false and status <> 'done' and remind_at is not null and remind_at <= now()
     returning id, title, subject, est`);
  const alarms = await d.q<{ id: string; title: string; body: string }>(
    `update alarms set sent = true where sent = false and at <= now() returning id, title, body`);
  await d.q(`delete from alarms where sent = true and at < now() - interval '1 day'`);

  let sent = 0;
  for (const t of due) {
    const r = await sendToAll({
      title: t.subject ? `${t.subject}: time to study` : 'Time to study',
      body: `${t.title} (${t.est} min)`,
      tag: `task-${t.id}`,
      url: `/?focus=${encodeURIComponent(t.id)}`,
    });
    sent += r.sent;
  }
  for (const a of alarms) sent += (await sendToAll({ title: a.title, body: a.body, tag: `alarm-${a.id}`, url: '/' })).sent;
  return { reminders: due.length, alarms: alarms.length, notificationsSent: sent };
}
