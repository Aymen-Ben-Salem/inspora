import {createHash} from 'node:crypto';
export const artifactSha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function releaseArtifactPathAllowed(path:string){
 return !!path&&!path.includes('\\')&&!path.includes(':')&&!path.startsWith('/')&&!path.split('/').some(p=>!p||['.','..','.git','.vercel','node_modules','.next','private-recovery'].includes(p)||p.startsWith('.env'))&&!/\.(pem|key|dump)$/i.test(path);
}
export function verifyReleaseArtifactEntry(entry:{path:string;bytes:number;sha256:string;base64:string},secrets:readonly string[]=[]){
 const bytes=Buffer.from(entry.base64,'base64');
 if(!releaseArtifactPathAllowed(entry.path)||bytes.length!==entry.bytes||artifactSha256(bytes)!==entry.sha256)throw Error('Release artifact entry rejected');
 if(secrets.some(s=>s.length>=12&&bytes.includes(Buffer.from(s))))throw Error('Release artifact credential scan failed');
 return bytes;
}
