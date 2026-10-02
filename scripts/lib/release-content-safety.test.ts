import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import ts from 'typescript';
import {releaseAuditResourceType} from './release-content-database';
import {RELEASE_CONTENT_CODE_FILES} from './release-content-code';

describe('release import audit and code pinning',()=>{
 it('labels retained logos correctly during mixed imports',()=>{
  expect(releaseAuditResourceType('retained',{logos:[{id:'retained'}],websites:[]},{logos:[],websites:[{id:'new-site'}]})).toBe('logo');
  expect(releaseAuditResourceType('new-site',{logos:[],websites:[]},{logos:[],websites:[{id:'new-site'}]})).toBe('website');
 });
 it('rejects ambiguous or missing audit identities',()=>{
  expect(()=>releaseAuditResourceType('same',{logos:[{id:'same'}],websites:[]},{logos:[],websites:[{id:'same'}]})).toThrow();
  expect(()=>releaseAuditResourceType('missing',{logos:[],websites:[]},{logos:[],websites:[]})).toThrow();
 });
 it('pins every local dependency used by the release importer',()=>{
  const visited=new Set<string>();
  function visit(file:string){if(visited.has(file))return;visited.add(file);expect(RELEASE_CONTENT_CODE_FILES).toContain(file);
   for(const imported of ts.preProcessFile(readFileSync(file,'utf8')).importedFiles){const name=imported.fileName;if(!name.startsWith('.')&&!name.startsWith('@/'))continue;
    const base=name.startsWith('@/')?resolve('src',name.slice(2)):resolve(dirname(file),name);
    const target=[base+'.ts',base+'.tsx',resolve(base,'index.ts')].find(existsSync);expect(target,'Missing local dependency '+name).toBeDefined();visit(relative(process.cwd(),target!).replaceAll('\\','/'));
   }
  }
  visit('scripts/release-content.ts');expect(RELEASE_CONTENT_CODE_FILES).toContain('package-lock.json');
 });
});
