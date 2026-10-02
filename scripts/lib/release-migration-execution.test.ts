import { describe, expect, it } from 'vitest';
import { assertReleasePlan, runReleaseTransaction } from './release-migration-execution';

describe('release execution safety', () => {
  it('rejects drift in code, target, ledger and data before writes', () => {
    const pinned = { target: 'rehearsal', code: 'a', ledger: [1], data: 'a' };
    expect(() => assertReleasePlan(pinned, { ...pinned })).not.toThrow();
    for (const field of Object.keys(pinned)) {
      expect(() => assertReleasePlan(pinned, { ...pinned, [field]: 'changed' })).toThrow(/drift/);
    }
  });
  it('rolls back when post-migration data verification fails', async () => {
    const statements: string[] = [];
    const client = { query: async (sql: string) => { statements.push(sql); return { rows: [], rowCount: 0 }; } };
    await expect(runReleaseTransaction(client, async () => {
      await client.query('migration statement');
      throw Error('original data changed');
    })).rejects.toThrow('original data changed');
    expect(statements[0]).toMatch(/^BEGIN/);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
  });
  it('commits only after verification and rejects a lock failure without migration', async () => {
    const statements: string[] = [];
    const client = { query: async (sql: string) => { statements.push(sql); return { rows: [], rowCount: 0 }; } };
    await runReleaseTransaction(client, async () => { statements.push('verified'); });
    expect(statements.slice(-2)).toEqual(['verified', 'COMMIT']);
    const locked = { query: async (sql: string) => { if (sql.startsWith('SET LOCAL')) throw Error('connection failure'); return { rows: [], rowCount: 0 }; } };
    let ran = false;
    await expect(runReleaseTransaction(locked, async () => { ran = true; })).rejects.toThrow();
    expect(ran).toBe(false);
  });
});
