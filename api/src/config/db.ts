import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Single shared connection pool - reused across all queries in the app.
// Never create a new Pool per-request; that exhausts Postgres connections fast.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);
  process.exit(-1);
});
