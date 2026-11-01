// Minimaler Nachbau der Cloudflare-D1-Schnittstelle auf Basis von node:sqlite
// (nur für lokale Tests – in Cloudflare stellt D1 diese Schnittstelle selbst bereit).
import { DatabaseSync } from 'node:sqlite';

export function createD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => statement(sql), exec: (sql) => db.exec(sql) };
}
