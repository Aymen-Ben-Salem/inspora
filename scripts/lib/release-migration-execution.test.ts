import { describe, expect, it } from 'vitest';
import { assertReleasePlan, captureReleaseDatabase, runReleaseTransaction } from './release-migration-execution';

describe('release execution safety', () => {
  it('reports a manually migrated disposable schema without fabricating a Drizzle migration ledger', async () => {
    const client = { query: async (statement: string) => {
      if (statement.includes('from drizzle.__drizzle_migrations')) throw Error('Missing ledger');
      if (statement.includes('information_schema.columns')) return { rows: [{ table_name: 'posts', column_name: 'id' }, { table_name: 'creators', column_name: 'id' }], rowCount: 2 };
      if (statement.includes('to_regclass')) return { rows: [{ available: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    } };
    const snapshot = await captureReleaseDatabase(client, { allowMissingLedger: true });
    expect(snapshot.migrationLedgerPresent).toBe(false);
    expect(snapshot.ledger).toEqual([]);
    await expect(captureReleaseDatabase(client)).rejects.toThrow('Missing ledger');
  });
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
