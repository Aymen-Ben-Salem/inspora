import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { pendingReleaseMigrations, releaseDatabaseFromValues, RELEASE_DATABASE_TARGETS } from './lib/release-migration';
import { assertReleasePlan, captureReleaseDatabase, quoteReleaseIdentifier, releaseDataHashes, releaseHash, releaseLedger, releaseObjectHash, runReleaseTransaction } from './lib/release-migration-execution';

async function main() {
  const args = process.argv.slice(2), options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--target','--plan','--apply','--sha256','--confirm-production'].includes(args[i]) || options[args[i]] || !args[i+1] || args[i+1].startsWith('--')) throw Error('Release arguments rejected.');
    options[args[i]] = args[i+1];
  }
  const targetName = options['--target'];
  if (targetName !== 'production' && targetName !== 'rehearsal') throw Error('Release explicit --target production|rehearsal required.');
  const applying = !!options['--apply'];
  if (applying === !!options['--plan'] || applying !== !!options['--sha256'] || !applying && options['--confirm-production']) throw Error('Release choose --plan FILE or --apply FILE --sha256 HASH.');
  if (applying && targetName === 'production' && options['--confirm-production'] !== 'AUTHORIZED-PRODUCTION-LAUNCH') throw Error('Release production apply requires explicit launch authorization.');
  const target = RELEASE_DATABASE_TARGETS[targetName];
  const environment = parse(readFileSync(targetName === 'production' ? '.env.production.local' : '.env.phase3-rehearsal.local'));
  const url = releaseDatabaseFromValues(environment, target, process.env);
  const planPath = resolve(options[applying ? '--apply' : '--plan']);
  const pinnedBytes = applying ? readFileSync(planPath) : null;
  if (pinnedBytes && releaseHash(pinnedBytes) !== options['--sha256']) throw Error('Release manifest digest mismatch.');
  const pinned = pinnedBytes ? JSON.parse(pinnedBytes.toString('utf8')) : null;
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
  const files = readMigrationFiles({ migrationsFolder: 'drizzle' });
  const migrations = journal.entries.map((entry: {tag:string;when:number}, i: number) => ({ tag: entry.tag, when: entry.when, hash: files[i].hash, lfHash: releaseHash(readFileSync(`drizzle/${entry.tag}.sql`,'utf8').replace(/\r\n/g,'\n')) }));
  const codeFiles = ['scripts/migrate-release.ts','scripts/lib/release-migration.ts','scripts/lib/release-migration-execution.ts','package.json','package-lock.json','drizzle/meta/_journal.json','node_modules/drizzle-orm/migrator.js','node_modules/drizzle-orm/pg-core/dialect.js'];
  const candidate = { head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), files: Object.fromEntries(codeFiles.map(file => [file,releaseHash(readFileSync(file))])), migrations };
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 20000, max: 1 });
  const client = await pool.connect();
  const started = Date.now();
  let stage = 'preflight';
  const receiptPath = join(dirname(planPath), 'migration-result-'+Date.now()+'.json');
  try {
    await client.query("SET application_name = 'inspora-release-migration'");
    if (!applying) await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const prepare = async () => {
      const before = await captureReleaseDatabase(client);
      const pending = pendingReleaseMigrations(migrations,before.ledger);
      if (pending.some(m => m.tag.startsWith('0026_')) && before.categories.some(c => !['Web','Branding','Product','Motion','Illustration','3D','Print'].includes(c.category))) throw Error('Release category membership incompatible with 0026.');
      return { version: 1, target, candidate, before, pending: pending.map(m => m.tag) };
    };
    if (!applying) {
      const plan = await prepare();
      await client.query('COMMIT');
      const bytes = JSON.stringify(plan,null,2)+'\n';
      writeFileSync(planPath,bytes,{flag:'wx'});
      console.log(JSON.stringify({mode:'read-only-plan',target:targetName,pending:plan.pending,sha256:releaseHash(bytes),seconds:(Date.now()-started)/1000}));
      return;
    }
    const timings: { tag: string; seconds: number; locks: unknown[] }[] = [];
    await runReleaseTransaction(client,async () => {
      stage = 'locking';
      if (!(await client.query('select pg_try_advisory_xact_lock(712934621) as acquired')).rows[0].acquired) throw Error('Release another migration holds the lock.');
      const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>'public.'+quoteReleaseIdentifier(r.tablename));
      await client.query(`LOCK TABLE ${[...tables,'drizzle.__drizzle_migrations'].join(',')} IN SHARE ROW EXCLUSIVE MODE`);
      stage = 'checking-pinned-plan';
      const actual = await prepare();
      assertReleasePlan(pinned,actual);
      stage = 'migration';
      // Installed Drizzle reader, journal order, splitting, raw hash and ledger
      // semantics; locks and postconditions are included in the same transaction.
      for (let i=actual.before.ledger.length;i<files.length;i++) {
        const stepStarted = Date.now();
        for (const statement of files[i].sql) await client.query(statement);
        await client.query('insert into drizzle.__drizzle_migrations (hash,created_at) values ($1,$2)',[files[i].hash,files[i].folderMillis]);
        const locks = (await client.query("select c.relname as relation,l.mode,l.granted from pg_locks l left join pg_class c on c.oid=l.relation where l.pid=pg_backend_pid() and l.locktype='relation' order by c.relname,l.mode")).rows;
        timings.push({tag:migrations[i].tag,seconds:(Date.now()-stepStarted)/1000,locks});
      }
      stage = 'postconditions';
      if (pendingReleaseMigrations(migrations,await releaseLedger(client)).length) throw Error('Release pending migrations remain.');
      assertReleasePlan(actual.before.data,await releaseDataHashes(client,actual.before.columns));
    });
    stage = 'committed';
    const ledger = await releaseLedger(client);
    const receipt = { target,manifestSha256:options['--sha256'],candidateSha256:releaseObjectHash(candidate),appliedAt:new Date().toISOString(),seconds:(Date.now()-started)/1000,timings,ledger,originalDataUnchanged:true,pending:pendingReleaseMigrations(migrations,ledger).length,committed:true };
    writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});
    console.log(JSON.stringify({receipt:receiptPath,seconds:receipt.seconds,applied:timings.map(t=>t.tag),pending:receipt.pending,originalDataUnchanged:true}));
  } catch (error) {
    if (applying) writeFileSync(receiptPath,JSON.stringify({stage,failedAt:new Date().toISOString(),target,committed:stage==='committed',instruction:'STOP. Inspect actual ledger/schema; do not blindly rerun. Raw error suppressed.'},null,2),{flag:'wx'});
    throw error;
  } finally { client.release(); await pool.end(); }
}
main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith('Release ') ? error.message : 'Release migration stopped; diagnostic details suppressed. Inspect the stage receipt and actual ledger before retry.');
  process.exitCode = 1;
});
