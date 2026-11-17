import pg from 'pg';
import { loadConfig } from '../config.js';

const { Pool } = pg;
const config = loadConfig();

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'audiotrust-api',
});

pool.on('error', (error) => {
  console.error(JSON.stringify({ level: 'error', message: 'Unexpected idle PostgreSQL client error', error: error.message }));
});
