import type pg from 'pg';

export type PassStatus = 'ACTIVE' | 'CANCELLED';

export interface Pass {
  id: string;
  name: string;
  document: string;
  issuedAt: Date;
  status: PassStatus;
}

export interface PassCounts {
  total: number;
  active: number;
}

export interface PassRepository {
  insert(pass: Pass): Promise<void>;
  findById(id: string): Promise<Pass | null>;
  findAll(): Promise<Pass[]>;
  counts(): Promise<PassCounts>;
  /** Returns the updated pass, or null when it does not exist. */
  updateStatus(id: string, status: PassStatus): Promise<Pass | null>;
  /** Returns true when a row was deleted. */
  delete(id: string): Promise<boolean>;
}

interface PassRow {
  id: string;
  name: string;
  document: string;
  issued_at: Date;
  status: PassStatus;
}

const COLUMNS = 'id, name, document, issued_at, status';

function toPass(row: PassRow): Pass {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    issuedAt: row.issued_at,
    status: row.status,
  };
}

/** PostgreSQL implementation. Every query is parameterized. */
export class PgPassRepository implements PassRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(pass: Pass): Promise<void> {
    await this.pool.query(
      'INSERT INTO passes (id, name, document, issued_at, status) VALUES ($1, $2, $3, $4, $5)',
      [pass.id, pass.name, pass.document, pass.issuedAt, pass.status],
    );
  }

  async findById(id: string): Promise<Pass | null> {
    const result = await this.pool.query<PassRow>(`SELECT ${COLUMNS} FROM passes WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toPass(row) : null;
  }

  async findAll(): Promise<Pass[]> {
    const result = await this.pool.query<PassRow>(`SELECT ${COLUMNS} FROM passes ORDER BY issued_at DESC, id`);
    return result.rows.map(toPass);
  }

  async counts(): Promise<PassCounts> {
    const result = await this.pool.query<{ total: string; active: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ACTIVE') AS active FROM passes`,
    );
    const row = result.rows[0];
    return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0) };
  }

  async updateStatus(id: string, status: PassStatus): Promise<Pass | null> {
    const result = await this.pool.query<PassRow>(
      `UPDATE passes SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, status],
    );
    const row = result.rows[0];
    return row ? toPass(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM passes WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
