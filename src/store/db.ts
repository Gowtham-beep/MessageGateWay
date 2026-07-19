import Database from 'better-sqlite3';
import { env } from '../config/env.js';

export const db = new Database(env.DB_PATH);
db.pragma('journal_mode = WAL');

// Runs migrations on boot stub
