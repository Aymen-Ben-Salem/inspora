import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,realpathSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {parse} from 'dotenv';
import {artifactSha256,releaseArtifactPathAllowed,verifyReleaseArtifactEntry} from './lib/release-artifact';
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const root=realpathSync('.');
const output=resolve('.scratch/release-refresh-20261022');
const operatorFiles=[
 'AGENTS.md','CONTEXT.md','docs/agents/domain.md','docs/agents/issue-tracker.md',
 '.scratch/release-refresh-20261022/snapshot-proof-1792710977574/receipt.json',
 '.scratch/release-refresh-20261022/phase1-capture-verify.ts','.scratch/release-refresh-20261022/phase1-capture-verification.json',
 ...['spec.md','resources.md','implementation-plan.md','creator-review.md','phase1-procedures.md','phase1-configuration-matrix.md','phase-1-completion.md','owner-clarification-20261023.md','phase2-reuse-proposal.md','identity-decisions.json','phase1-content-audit.ts','phase1-plans.ts','phase1-media-check.ts','phase1-provider-check.cjs','phase1-vitest.config.mts','phase1-tsconfig.json','snapshot-protocol-proposal.md','snapshot-local-proof.ts','phase1-historical-binding-review.json','snapshot-proof-1792709893997/receipt.json'].map(f=>'.scratch/release-refresh-20261022/'+f),
 '.scratch/release-preparation/phase3-database-recovery.ts',
 ...['handoff.md','new-account-handoff-20261020.md','vat-decision-20261021.md','launch-and-recovery.md'].map(f=>'.scratch/sponsorship/production-preparation/'+f),
];
function main(){
 if(process.argv.length!==2||git('branch','--show-current').trim()!=='preview/archive-updates')throw Error('Release artifact preview branch required');
 const names=[...new Set(git('ls-files','-z','--cached','--others','--exclude-standard').split('\0').filter(Boolean))].sort();
 const sources=names.filter(p=>!p.startsWith('.scratch/')&&!p.startsWith('docs/')&&releaseArtifactPathAllowed(p)&&existsSync(p));
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('.','-');
 const artifact=resolve(output,'source-'+stamp),kitPath=resolve(output,'operator-kit-'+stamp+'.json');
 if(!artifact.startsWith(root+sep)||existsSync(artifact)||existsSync(kitPath))throw Error('Release artifact output rejected');
 const secrets=new Set<string>();
 for(const f of [...readdirSync(root).filter(f=>f.startsWith('.env')&&f!=='.env.example'&&statSync(f).isFile()),'.scratch/sponsorship/.env.ticket01-rehearsal','.scratch/sponsorship/.env.ticket02-provider-contract']){
  if(!existsSync(f))continue;
  for(const [key,value]of Object.entries(parse(readFileSync(f))))if(/SECRET|TOKEN|PASSWORD|ACCESS_KEY|DATABASE.*URL|ADMIN_USER_IDS|PUBLISHABLE_KEY|API_KEY/.test(key)&&value.length>=12&&!value.includes('REPLACE'))secrets.add(value);
 }
 const entries=[...new Set([...sources,...operatorFiles])].sort().map(path=>{
  if(!releaseArtifactPathAllowed(path))throw Error('Release artifact path rejected');
  const actual=realpathSync(path);if(!actual.startsWith(root+sep))throw Error('Release artifact source leaves workspace');
  const bytes=readFileSync(actual),entry={path,bytes:bytes.length,sha256:artifactSha256(bytes),base64:bytes.toString('base64')};verifyReleaseArtifactEntry(entry,[...secrets]);return entry;
 });
 mkdirSync(artifact);
 for(const e of entries.filter(e=>sources.includes(e.path))){const target=resolve(artifact,e.path);if(!target.startsWith(artifact+sep))throw Error('Release artifact destination rejected');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,verifyReleaseArtifactEntry(e),{flag:'wx'});if(artifactSha256(readFileSync(target))!==e.sha256)throw Error('Release artifact copied bytes differ');}
 for(const e of entries)if(artifactSha256(readFileSync(e.path))!==e.sha256)throw Error('Release artifact source changed during export');
 const manifest={format:'inspora-sponsorship-source-v1',head:git('rev-parse','HEAD').trim(),branch:'preview/archive-updates',worktreeStatus:git('status','--short'),at:new Date().toISOString(),hashes:Object.fromEntries(entries.filter(e=>sources.includes(e.path)).map(e=>[e.path,e.sha256])),sourceFiles:sources.length,artifact:artifact.slice(root.length+1).replaceAll('\\','/')};
 const manifestPath=resolve(output,'source-manifest-'+stamp+'.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const kit={format:'inspora-phase3-operator-kit-v1',head:manifest.head,at:manifest.at,candidateSourceManifestSha256:artifactSha256(readFileSync(manifestPath)),files:entries,excluded:['All environment files and credentials','Private database/media backups','Dependencies and build outputs','Superseded execution runbooks'],recovery:'Local Phase 1 preparation; not a protected or independently restored release. Reacquire credentials separately. Current refresh plan and billing handoff govern future execution.'};
 writeFileSync(kitPath,JSON.stringify(kit),{flag:'wx'});
 const reread=JSON.parse(readFileSync(kitPath,'utf8'));for(const e of reread.files)verifyReleaseArtifactEntry(e,[...secrets]);
 const receipt={at:manifest.at,artifact:manifest.artifact,sourceFiles:sources.length,kitFiles:entries.length,manifest:manifestPath.slice(root.length+1).replaceAll('\\','/'),manifestSha256:artifactSha256(readFileSync(manifestPath)),operatorKit:kitPath.slice(root.length+1).replaceAll('\\','/'),kitSha256:artifactSha256(readFileSync(kitPath)),allBytesVerified:true,credentialScanPassed:true,networkRequests:0,remoteWrites:0,offDeviceCopyDeferred:true};
 writeFileSync(resolve(output,'artifact-receipt-'+stamp+'.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
 writeFileSync(resolve(output,'phase1-artifacts.json'),JSON.stringify({...receipt,receipt:'artifact-receipt-'+stamp+'.json'},null,2)+'\n');
}
try{main()}catch(error){console.error(error instanceof Error&&error.message.startsWith('Release artifact')?error.message:'Release artifact generation stopped; details suppressed');process.exitCode=1;}
