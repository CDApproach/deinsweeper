// Adresse des Weltranglisten-Servers (Cloudflare Worker), z. B.
//   'https://knobelfeld-api.deinname.workers.dev'
// Leer lassen = nur lokale Bestenliste auf jedem Gerät.
// Lokal mit `node worker/dev.mjs` wird automatisch der Testserver benutzt.
const PRODUCTION_API = 'https://knobelfeld-api.kurs-alarm-worker.workers.dev';

export const API_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? location.origin
  : PRODUCTION_API;
