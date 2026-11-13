import fs from 'node:fs';import path from 'node:path';import {randomBytes,createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {loadProductionMediaEnvironment} from './lib/production-environment.ts';
import {parse} from 'dotenv';

// Run from the maintainer workspace using node --import tsx. Never prints credentials.
async function main(){
  const apply=process.argv.includes('--apply');
  if(process.argv.slice(2).some(arg=>!['--apply','--confirm-production'].includes(arg))||apply&&!process.argv.includes('--confirm-production'))throw Error('Invalid mode');
  const environment=loadProductionMediaEnvironment(),owner=neon(environment.databaseUrl);
  const directory=path.resolve('.scratch/inspora-production-catalog-20261113');fs.mkdirSync(directory,{recursive:true});
  const query=fs.readFileSync(new URL('../tools/inspora-mcp/capture.sql',import.meta.url),'utf8');
  const [roles,views,grants]=await owner.transaction([
    owner`SELECT rolname FROM pg_roles WHERE rolname='inspora_catalog_reader'`,
    owner`SELECT to_regclass('public.inspora_mcp_public_catalog') AS name`,
    owner`SELECT nspname FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE'`
  ],{readOnly:true});
  if(roles.length||views[0].name||grants.length)throw Error('Existing objects or broad public schema grants require inspection');
  if(!apply){console.log(JSON.stringify({mode:'dry-run',objectsAbsent:true,publicSchemaCreate:false,querySha256:createHash('sha256').update(query).digest('hex')}));return;}
  const secretPath=path.resolve('.env.inspora-catalog.local');
  let secrets;
  if(fs.existsSync(secretPath))secrets=parse(fs.readFileSync(secretPath));
  else {
    const url=new URL(environment.databaseUrl);url.username='inspora_catalog_reader';url.password=randomBytes(32).toString('hex');
    secrets={INSPORA_CATALOG_SOURCE_DATABASE_URL:url.href,INSPORA_CATALOG_TOKEN:randomBytes(32).toString('base64url')};
    fs.writeFileSync(secretPath,Object.entries(secrets).map(([key,value])=>key+'='+value).join('\n')+'\n',{flag:'wx',mode:0o600});
  }
  const readerUrl=new URL(secrets.INSPORA_CATALOG_SOURCE_DATABASE_URL),password=readerUrl.password;
  if(readerUrl.username!=='inspora_catalog_reader'||readerUrl.hostname!==new URL(environment.databaseUrl).hostname||!/^\w{64}$/.test(password))throw Error('Reader configuration mismatch');
  await owner.transaction([
    owner.query(`CREATE ROLE inspora_catalog_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`),
    owner.query('ALTER ROLE inspora_catalog_reader SET default_transaction_read_only=on'),
    owner.query('CREATE VIEW public.inspora_mcp_public_catalog WITH (security_barrier=true) AS '+query),
    owner.query('REVOKE ALL ON public.inspora_mcp_public_catalog FROM PUBLIC'),
    owner.query('GRANT USAGE ON SCHEMA public TO inspora_catalog_reader'),
    owner.query('GRANT SELECT ON public.inspora_mcp_public_catalog TO inspora_catalog_reader')
  ]);
  const reader=neon(readerUrl.href);
  const [attributes,readable,writable,memberships,count]=await reader.transaction([
    reader`SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,current_setting('transaction_read_only') AS read_only FROM pg_roles WHERE rolname=current_user`,
    reader`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'SELECT') OR has_any_column_privilege(current_user,c.oid,'SELECT'))`,
    reader`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))`,
    reader`SELECT roleid FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)`,
    reader`SELECT count(*)::int AS works FROM public.inspora_mcp_public_catalog`
  ],{readOnly:true,isolationLevel:'RepeatableRead'});
  const role=attributes[0];
  if(role.rolsuper||role.rolcreaterole||role.rolcreatedb||role.rolreplication||role.rolbypassrls||readable.length!==1||readable[0].relname!=='inspora_mcp_public_catalog'||writable.length||memberships.length)throw Error('Reader privilege verification failed');
  const receipt={at:new Date().toISOString(),role,readable,writable,memberships,works:count[0].works,querySha256:createHash('sha256').update(query).digest('hex')};
  fs.writeFileSync(path.join(directory,'reader-provision.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
main().catch(()=>{console.error('Catalog reader provisioning failed; inspect current state before retrying. Sensitive provider details suppressed.');process.exitCode=1;});
