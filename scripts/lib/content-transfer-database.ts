import { canonicalHash, CONTENT_COLUMNS, D1, EXCLUDED_WEBSITE_ID, text, type ContentSnapshot, type ContentTransferPlan, type Row, type RowChange } from "./content-transfer-plan";

export interface TransferDatabaseClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const publicTables = ["creators", "posts", "post_media", "logos", "logo_media", "websites", "website_media", "website_sections", "creator_username_aliases", "design_categories"];
const hashSql = (expression: string) => `encode(sha256(convert_to(coalesce(jsonb_agg(${expression} order by (${expression})::text)::text,'[]'),'UTF8')),'hex')`;
const fail = (message: string): never => { throw new Error(`Transfer database assertion: ${message}.`); };

export async function captureContentSnapshot(client: TransferDatabaseClient, environment: "source" | "preview"): Promise<ContentSnapshot> {
  const schema = (await client.query("select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in ('public','drizzle') order by table_schema,table_name,ordinal_position")).rows;
  const allTables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => text(r, "tablename"));
  const selected = environment === "source" ? ["creators", "posts", "post_media"] : publicTables;
  const rows: Record<string, Row[]> = {};
  for (const table of selected) {
    if (!allTables.includes(table)) fail(`missing table ${table}`);
    const identity = table === "creators" && environment === "preview" ? " || jsonb_build_object('has_owner',t.owner_user_id is not null,'has_verified_x',t.x_provider_id is not null)" : "";
    const result = await client.query(`select (to_jsonb(t) - array['created_by','updated_by','owner_user_id','x_provider_id']::text[])${identity} as row from public.${quote(table)} t order by ${table === "design_categories" ? "name" : "id"}`);
    rows[table] = result.rows.map(r => r.row as Row);
  }
  const tableHashes: ContentSnapshot["tableHashes"] = {};
  for (const table of environment === "source" ? selected : allTables) {
    tableHashes[table] = (await client.query(`select count(*)::int as count, ${hashSql("to_jsonb(t)")} as sha256 from public.${quote(table)} t`)).rows[0] as ContentSnapshot["tableHashes"][string];
  }
  const capturedAt = text((await client.query("select now()::text as captured_at")).rows[0], "captured_at");
  const ledger = (await client.query("select to_jsonb(t) as row from drizzle.__drizzle_migrations t order by created_at")).rows.map(r => r.row as Row);
  const constraints = (await client.query("select c.relname as table_name, con.conname as name, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,con.conname")).rows;
  const indexes = (await client.query("select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','drizzle') order by schemaname,tablename,indexname")).rows;
  return { capturedAt, rows, tableHashes, schema, ledger, constraints, indexes };
}

export function assertSnapshotUnchanged(expected: ContentSnapshot, actual: ContentSnapshot) {
  for (const field of ["schema", "ledger", "constraints", "indexes", "tableHashes"] as const) if (canonicalHash(expected[field]) !== canonicalHash(actual[field])) fail(`snapshot drift in ${field}`);
}
export function assertCleanupScope(id: string) {
  if (id !== EXCLUDED_WEBSITE_ID) fail("cleanup ID is not the approved test website");
}
export function assertCleanupRecovery(snapshot: ContentSnapshot, recovered: ContentSnapshot["tableHashes"]) {
  for (const table of ["websites", "website_media", "website_sections", "saved_posts"]) {
    if (!recovered[table] || !snapshot.tableHashes[table] || canonicalHash(recovered[table]) !== canonicalHash(snapshot.tableHashes[table])) fail(`cleanup recovery does not cover current ${table}`);
  }
}
export async function runCheckedTransaction(client: TransferDatabaseClient, operations: { guard(): void; lock(): Promise<void>; checkBefore(): Promise<unknown>; write(): Promise<unknown>; verify(): Promise<unknown> }) {
  operations.guard();
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await operations.lock();
    await operations.checkBefore();
    await operations.write();
    await operations.verify();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Scan JSON as well as declared foreign keys; unfamiliar references stop consolidation. */
export async function inspectD1References(client: TransferDatabaseClient, snapshot: ContentSnapshot) {
  const references: Record<string, number> = {};
  for (const table of Object.keys(snapshot.tableHashes)) {
    const count = Number((await client.query(`select count(*)::int as count from public.${quote(table)} t where to_jsonb(t)::text like $1`, [`%${D1.duplicate}%`])).rows[0].count);
    if (count) references[table] = count;
    if (count && !["creators", "creator_username_aliases", "logos", "admin_audit_logs"].includes(table)) fail(`unreviewed D1 reference in ${table}`);
  }
  if (references.logos && (references.logos !== 1 || !snapshot.rows.logos.some(r => r.id === D1.auric && r.creator_id === D1.duplicate))) fail("unreviewed D1 logo reference");
  const unexpectedAudit = Number((await client.query("select count(*)::int as count from admin_audit_logs t where to_jsonb(t)::text like $1 and (resource_id::text <> $2 or resource_type <> 'creator' or details ? 'contentTransferOriginalResourceId')", [`%${D1.duplicate}%`, D1.duplicate])).rows[0].count);
  if (unexpectedAudit) fail("unreviewed D1 audit reference");
  return references;
}

async function writeRows(client: TransferDatabaseClient, changes: RowChange[]) {
  const groups = new Map<string, RowChange[]>();
  for (const change of changes) {
    if (!CONTENT_COLUMNS[change.table] || change.fields.some(f => !CONTENT_COLUMNS[change.table].includes(f) || f === "id")) fail("column allowlist violation");
    const key = JSON.stringify([change.table, !!change.before, change.fields]);
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  for (const group of groups.values()) {
    const { table, before, fields } = group[0];
    const columns = ["id", ...fields];
    const payload = group.map(c => Object.fromEntries(columns.map(k => [k, c.after[k]])));
    const recordset = `jsonb_populate_recordset(null::public.${quote(table)}, $1::jsonb)`;
    const query = before
      ? `update public.${quote(table)} t set ${fields.map(f => `${quote(f)}=p.${quote(f)}`).join(",")} from ${recordset} p where t.id=p.id returning t.id`
      : `insert into public.${quote(table)} (${columns.map(quote).join(",")}) select ${columns.map(quote).join(",")} from ${recordset} returning id`;
    if ((await client.query(query, [JSON.stringify(payload)])).rowCount !== group.length) fail(`unexpected ${table} write count`);
  }
}

async function preservedColumnHashes(client: TransferDatabaseClient, plan: ContentTransferPlan) {
  const hashes: Record<string, unknown> = {};
  for (const table of ["creators", "posts", "post_media", "logos"]) {
    const changes = plan.changes.filter(r => r.table === table && r.before).map(r => ({ id: r.id, fields: r.fields }));
    if (!changes.length) continue;
    const expression = "to_jsonb(t) - array(select jsonb_array_elements_text(p.fields))";
    hashes[table] = (await client.query(`select ${hashSql(expression)} as sha256 from public.${quote(table)} t join jsonb_to_recordset($1::jsonb) as p(id uuid,fields jsonb) on t.id=p.id`, [JSON.stringify(changes)])).rows[0].sha256;
  }
  return hashes;
}

export function assertDesiredRows(plan: ContentTransferPlan, actual: ContentSnapshot) {
  for (const [table, expected] of Object.entries(plan.desired)) {
    const rows = actual.rows[table];
    if (!rows || rows.length !== expected.length) fail(`row count mismatch in ${table}`);
    for (const row of expected) {
      const match = rows.find(r => table === "design_categories" ? r.name === row.name : r.id === row.id);
      if (!match || Object.entries(row).some(([key, value]) => canonicalHash(value ?? null) !== canonicalHash(match[key] ?? null))) fail(`row mismatch in ${table} ${row.id ?? row.name}`);
    }
  }
}

export async function applyContentTransfer(client: TransferDatabaseClient, expected: ContentSnapshot, plan: ContentTransferPlan, guard: () => void) {
  let preserved: Record<string, unknown>;
  await runCheckedTransaction(client, {
    guard,
    lock: async () => { await client.query("LOCK TABLE creators,posts,post_media,logos,creator_username_aliases,admin_audit_logs IN SHARE ROW EXCLUSIVE MODE"); },
    checkBefore: async () => {
      assertSnapshotUnchanged(expected, await captureContentSnapshot(client, "preview"));
      if (plan.mergeDuplicate) await inspectD1References(client, expected);
      preserved = await preservedColumnHashes(client, plan);
    },
    write: async () => {
      if (plan.mergeDuplicate) {
        const result = await client.query("update creators set username=null where id=$1::uuid and username='cabralorenzo' and owner_user_id is null and x_provider_id is null returning id", [D1.duplicate]);
        if (result.rowCount !== 1) fail("D1 identity changed");
      }
      await writeRows(client, plan.changes);
      if (plan.mergeDuplicate) {
        await client.query("update creator_username_aliases set creator_id=$1::uuid where creator_id=$2::uuid", [D1.survivor, D1.duplicate]);
        await client.query("update admin_audit_logs set resource_id=$1::uuid, details=details || jsonb_build_object('contentTransferOriginalResourceId',resource_id::text) where resource_id=$2::uuid and resource_type='creator'", [D1.survivor, D1.duplicate]);
        if ((await client.query("delete from creators where id=$1::uuid and owner_user_id is null and x_provider_id is null returning id", [D1.duplicate])).rowCount !== 1) fail("D1 duplicate deletion count");
      }
      if (plan.aliasInserts.length) {
        const result = await client.query("insert into creator_username_aliases (id,creator_id,username,is_current) select id,creator_id,username,is_current from jsonb_populate_recordset(null::creator_username_aliases,$1::jsonb) returning id", [JSON.stringify(plan.aliasInserts)]);
        if (result.rowCount !== plan.aliasInserts.length) fail("alias insertion count");
      }
    },
    verify: async () => {
      const after = await captureContentSnapshot(client, "preview");
      assertDesiredRows(plan, after);
      if (canonicalHash(preserved) !== canonicalHash(await preservedColumnHashes(client, plan))) fail("private or non-allowlisted columns changed");
      const allowed = new Set(["creators", "posts", "post_media", "logos", "creator_username_aliases", ...(plan.mergeDuplicate ? ["admin_audit_logs"] : [])]);
      for (const [table, before] of Object.entries(expected.tableHashes)) if (!allowed.has(table) && canonicalHash(before) !== canonicalHash(after.tableHashes[table])) fail(`unrelated ${table} changed`);
      if (plan.mergeDuplicate) {
        const expression = "case when t.details->>'contentTransferOriginalResourceId'=$1 then to_jsonb(t) || jsonb_build_object('resource_id',$1::text,'details',t.details-'contentTransferOriginalResourceId') else to_jsonb(t) end";
        const auditHash = (await client.query(`select ${hashSql(expression)} as sha256 from admin_audit_logs t`, [D1.duplicate])).rows[0].sha256;
        if (auditHash !== expected.tableHashes.admin_audit_logs.sha256) fail("audit history changed beyond D1 mapping");
      }
    },
  });
}

export async function deleteExactTestWebsite(client: TransferDatabaseClient, expected: ContentSnapshot, id: string, guard: () => void) {
  assertCleanupScope(id);
  if (!expected.rows.websites.some(r => r.id === id)) return;
  const affected = new Set(["websites", "website_media", "website_sections", "saved_posts"]);
  const remainingHashes: Record<string, unknown> = {};
  const remaining = async (table: string) => (await client.query(`select ${hashSql("to_jsonb(t)")} as sha256 from ${quote(table)} t where ${table === "websites" ? "id" : "website_id"} is distinct from $1::uuid`, [id])).rows[0].sha256;
  await runCheckedTransaction(client, {
    guard,
    lock: async () => { await client.query("LOCK TABLE websites,website_media,website_sections,saved_posts IN SHARE ROW EXCLUSIVE MODE"); },
    checkBefore: async () => {
      assertSnapshotUnchanged(expected, await captureContentSnapshot(client, "preview"));
      for (const table of affected) remainingHashes[table] = await remaining(table);
      // Future dependent FKs must be explicitly reviewed before a cascading delete.
      const foreignKeys = await client.query("select c.relname as table_name from pg_constraint con join pg_class c on c.oid=con.conrelid where con.contype='f' and con.confrelid='public.websites'::regclass");
      if (foreignKeys.rows.some(r => !affected.has(text(r, "table_name")))) fail("unreviewed website foreign key");
    },
    write: async () => {
      if ((await client.query("delete from websites where id=$1::uuid returning id", [id])).rowCount !== 1) fail("test website deletion count");
    },
    verify: async () => {
      const after = await captureContentSnapshot(client, "preview");
      for (const [table, before] of Object.entries(expected.tableHashes)) if (!affected.has(table) && canonicalHash(before) !== canonicalHash(after.tableHashes[table])) fail(`cleanup changed unrelated ${table}`);
      for (const table of affected) {
        if (remainingHashes[table] !== await remaining(table)) fail(`cleanup changed unrelated ${table} rows`);
        const count = Number((await client.query(`select count(*)::int as count from ${quote(table)} where ${table === "websites" ? "id" : "website_id"}=$1::uuid`, [id])).rows[0].count);
        if (count !== 0) fail(`cleanup left ${table} references`);
      }
    },
  });
}
