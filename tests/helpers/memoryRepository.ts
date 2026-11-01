import type { Pass, PassCounts, PassRepository, PassStatus } from '../../src/repositories/pass.repository.js';

export class MemoryPassRepository implements PassRepository {
  readonly passes = new Map<string, Pass>();

  async insert(pass: Pass): Promise<void> {
    this.passes.set(pass.id, { ...pass });
  }
  async findById(id: string): Promise<Pass | null> {
    const pass = this.passes.get(id);
    return pass ? { ...pass } : null;
  }
  async findAll(): Promise<Pass[]> {
    return [...this.passes.values()].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
  }
  async counts(): Promise<PassCounts> {
    const all = [...this.passes.values()];
    return { total: all.length, active: all.filter((p) => p.status === 'ACTIVE').length };
  }
  async updateStatus(id: string, status: PassStatus): Promise<Pass | null> {
    const pass = this.passes.get(id);
    if (!pass) return null;
    pass.status = status;
    return { ...pass };
  }
  async delete(id: string): Promise<boolean> {
    return this.passes.delete(id);
  }
}
