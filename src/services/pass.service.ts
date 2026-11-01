import { randomUUID } from 'node:crypto';
import type { Pass, PassCounts, PassRepository } from '../repositories/pass.repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly fields: string[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface NewPassInput {
  name: unknown;
  document: unknown;
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** Business logic for passes. Unknown or malformed ids behave as "not found". */
export class PassService {
  constructor(private readonly repository: PassRepository) {}

  async create(input: NewPassInput): Promise<Pass> {
    const invalid = (['name', 'document'] as const).filter((field) => isBlank(input[field]));
    if (invalid.length > 0) {
      throw new ValidationError(`Fields must be non-empty strings: ${invalid.join(', ')}`, invalid);
    }
    const pass: Pass = {
      id: randomUUID(),
      // Formats are intentionally not validated; only surrounding whitespace is trimmed.
      name: (input.name as string).trim(),
      document: (input.document as string).trim(),
      issuedAt: new Date(),
      status: 'ACTIVE',
    };
    await this.repository.insert(pass);
    return pass;
  }

  async get(id: string): Promise<Pass | null> {
    return isUuid(id) ? this.repository.findById(id) : null;
  }

  list(): Promise<Pass[]> {
    return this.repository.findAll();
  }

  counts(): Promise<PassCounts> {
    return this.repository.counts();
  }

  async cancel(id: string): Promise<Pass | null> {
    return isUuid(id) ? this.repository.updateStatus(id, 'CANCELLED') : null;
  }

  async delete(id: string): Promise<boolean> {
    return isUuid(id) ? this.repository.delete(id) : false;
  }
}

/** JSON representation used by the machine-to-machine API. */
export function toApiPass(pass: Pass) {
  return {
    id: pass.id,
    name: pass.name,
    document: pass.document,
    issuedAt: pass.issuedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    status: pass.status,
  };
}
