// Light is the default. Dark only when the user picks it (or picks "Match phone" and the phone is dark).
export type Theme = 'light' | 'dark' | 'auto';
const KEY = 'onething.theme';

export const getTheme = (): Theme => {
  try { const t = localStorage.getItem(KEY); return t === 'dark' || t === 'auto' ? t : 'light'; } catch { return 'light'; }
};

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(t: Theme = getTheme()) {
  const dark = t === 'dark' || (t === 'auto' && mq().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151311' : '#fff4ec');
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  applyTheme(t);
}

export function initTheme() {
  applyTheme();
  mq().addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme(); });
}
