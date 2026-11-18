const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return ymd(d); };
export const fmtDay = (s: string) => new Date(s + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
/** ISO string -> value for <input type="datetime-local"> in local time */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** <input type="datetime-local"> value (local) -> ISO string */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export const mmss = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
