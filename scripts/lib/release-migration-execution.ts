import { createHash } from 'node:crypto';
import type { ReleaseLedgerRow } from './release-migration';

export interface ReleaseClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, any>[]; rowCount: number | null }>;
}
export const releaseHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const releaseObjectHash = (value: unknown) => releaseHash(JSON.stringify(stable(value)));
export const quoteReleaseIdentifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

export function assertReleasePlan(expected: unknown, actual: unknown) {
  if (releaseObjectHash(expected) !== releaseObjectHash(actual)) throw Error('Release plan drift; generate and review a fresh plan.');
}

export async function runReleaseTransaction<T>(client: ReleaseClient, work: () => Promise<T>): Promise<T> {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function releaseLedger(client: ReleaseClient): Promise<ReleaseLedgerRow[]> {
  return (await client.query('select id,hash,created_at from drizzle.__drizzle_migrations order by id')).rows as ReleaseLedgerRow[];
}

export async function releaseDataHashes(client: ReleaseClient, columns: Record<string, string[]>) {
  const result: Record<string, unknown> = {};
  for (const [table, names] of Object.entries(columns)) {
    const projection = names.map(quoteReleaseIdentifier).join(',');
    result[table] = (await client.query(`select count(*)::int as count, encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from (select ${projection} from public.${quoteReleaseIdentifier(table)}) t`)).rows[0];
  }
  return result;
}

export async function captureReleaseDatabase(client: ReleaseClient) {
  const schema = (await client.query("select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const columns: Record<string, string[]> = {};
  for (const row of schema) (columns[row.table_name] ??= []).push(row.column_name);
  if (!columns.posts || !columns.creators) throw Error('Release required tables missing.');
  const constraints = (await client.query("select c.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,con.conname")).rows;
  const indexes = (await client.query("select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','drizzle') order by schemaname,tablename,indexname")).rows;
  const categories = (await client.query('select category,count(*)::int as count from posts group by category order by category')).rows;
  return { schema, columns, constraints, indexes, categories, ledger: await releaseLedger(client), data: await releaseDataHashes(client, columns) };
}
