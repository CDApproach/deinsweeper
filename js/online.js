// Verbindung zur Weltrangliste. Jede Funktion liefert die Antwort des Servers
// oder null, wenn er nicht erreichbar ist – das Spiel läuft dann einfach lokal weiter.
import { API_URL } from './config.js';

export const online = { enabled: !!API_URL };

async function call(path, body, timeout = 6000) {
  if (!online.enabled) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(API_URL + path, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }
      : { signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 500) return null;
    return { ...data, status: res.status };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Kurzes Zeitlimit: Beim ersten Tipp soll niemand lange warten.
  start: async (mode, diff) => {
    const r = await call('/api/start', { mode, diff }, 2500);
    return r && r.id ? r : null;
  },
  finish: (data) => call('/api/finish', data, 8000),
  claim: (id, name) => call('/api/claim', { id, name }),
  scores: async (mode, diff) => {
    const r = await call(`/api/scores?mode=${mode}&diff=${diff}&limit=25`);
    return r && Array.isArray(r.scores) ? r : null;
  },
};
