import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export let db = new Database(env.DB_PATH);
db.pragma('journal_mode = WAL');

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

export function initDb() {
  db.exec(schemaSql);
}

// Run on boot
initDb();

export function resetDb() {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS message_events;
    DROP TABLE IF EXISTS webhook_events;
  `);
  initDb();
}
