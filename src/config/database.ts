import pg from 'pg';

export function createPool(databaseUrl: string, ssl: boolean): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}
