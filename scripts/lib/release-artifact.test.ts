import {describe,it,expect} from 'vitest';
import {artifactSha256,releaseArtifactPathAllowed,verifyReleaseArtifactEntry} from './release-artifact';
describe('current source recovery artifact',()=>{
 it('allows current source, migrations, assets, configs and explicitly selected operator instructions',()=>{for(const p of ['src/db/schema.ts','drizzle/0038_add.sql','drizzle.production.config.ts','public/icon.svg','AGENTS.md','.scratch/release-refresh-20261022/phase-1-completion.md'])expect(releaseArtifactPathAllowed(p)).toBe(true);});
 it('rejects environment files, traversal, secrets, dependency/build outputs and protected recovery bytes',()=>{for(const p of ['.env.example','nested/.env.production.local','../secret','/secret','C:/secret','src/../secret','.git/config','.vercel/project.json','node_modules/a','private-recovery/a','nested/key.pem'])expect(releaseArtifactPathAllowed(p)).toBe(false);});
 it('verifies every decoded byte and rejects credentials or changed content',()=>{const b=Buffer.from('source content'),entry={path:'src/a.ts',bytes:b.length,sha256:artifactSha256(b),base64:b.toString('base64')};expect(verifyReleaseArtifactEntry(entry)).toEqual(b);expect(()=>verifyReleaseArtifactEntry({...entry,sha256:'0'.repeat(64)})).toThrow();expect(()=>verifyReleaseArtifactEntry(entry,['source content'])).toThrow(/credential/);});
});
