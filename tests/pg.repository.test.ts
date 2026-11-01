import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgPassRepository } from '../src/repositories/pass.repository.js';
import { PassService } from '../src/services/pass.service.js';

// Integration test against a real, migrated database. Runs only when TEST_DATABASE_URL is set,
// e.g. TEST_DATABASE_URL=postgres://passes:localdev@localhost:55432/digital_passes npm test
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('PgPassRepository (PostgreSQL)', () => {
  let pool: pg.Pool;
  let service: PassService;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    service = new PassService(new PgPassRepository(pool));
  });
  afterAll(async () => {
    await pool.end();
  });

  it('creates, reads, cancels and deletes a pass', async () => {
    const before = await service.counts();
    const pass = await service.create({ name: "O'Brien; DROP TABLE passes;--", document: 'HR-1' });

    expect(await service.get(pass.id)).toEqual(pass);
    expect((await service.counts()).total).toBe(before.total + 1);
    expect((await service.list()).some((p) => p.id === pass.id)).toBe(true);

    expect((await service.cancel(pass.id))?.status).toBe('CANCELLED');
    expect((await service.counts()).active).toBe(before.active);

    expect(await service.delete(pass.id)).toBe(true);
    expect(await service.get(pass.id)).toBeNull();
    expect(await service.delete(pass.id)).toBe(false);
  });

  it('enforces the schema constraints', async () => {
    const id = crypto.randomUUID();
    await expect(
      pool.query("INSERT INTO passes (id, name, document, status) VALUES ($1, 'A', 'B', 'EXPIRED')", [id]),
    ).rejects.toThrow(/check constraint/);
    await expect(pool.query("INSERT INTO passes (id, name, document) VALUES ($1, '  ', 'B')", [id])).rejects.toThrow(
      /check constraint/,
    );
  });
});
