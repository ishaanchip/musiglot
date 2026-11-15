const TOKEN_KEY = 'musiglot.token';

// "Remember me" keeps the session in localStorage (survives closing the browser);
// otherwise it lives in sessionStorage and ends when the tab or browser closes.
export const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
export function setToken(token, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: formData || (body ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const LANGUAGES = { es: { name: 'Spanish', native: 'Español', speech: 'es-MX' }, hi: { name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' } };

export const formatDuration = (sec = 0) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export const formatScore = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1));
/** good / ok / poor, used for colour-coding scores. */
export const scoreLevel = (x) => (x == null ? 'none' : x >= 7 ? 'good' : x >= 4 ? 'ok' : 'poor');
