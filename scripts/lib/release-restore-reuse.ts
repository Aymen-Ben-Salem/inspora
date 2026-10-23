import { createHash } from 'node:crypto';
import { canonicalHash } from './content-transfer-plan';

export const RESTORE_REUSE_TARGET = {
  projectId: 'dark-credit-44619307', branchId: 'br-jolly-night-aspicwk5',
  parentBranchId: 'br-fragrant-firefly-asbqbiqo', database: 'neondb',
  endpointSha256: '41216fa6801e563d2e658d1a0ceaaf96f2848e74984a1533d852eec485f75918',
};
export type RestoreReusePlan = {
  version: 1; target: typeof RESTORE_REUSE_TARGET; beforeSha256: string;
  consumers: { reviewedAt: string; expiresAt: string; bindingsComplete: boolean; consumers: string[] };
  retainedCopy: { archiveSha256: string; independentlyRestored: boolean; verifiedDownloadSha256: string };
  sourceArchiveSha256: string;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (reason: string): never => { throw Error('Restore reuse: ' + reason); };

export function guardRestoreReuse(url: string, plan: RestoreReusePlan, now: number, authorization?: string) {
  const u = new URL(url);
  if (plan.version !== 1 || canonicalHash(plan.target) !== canonicalHash(RESTORE_REUSE_TARGET) ||
      !['postgres:', 'postgresql:'].includes(u.protocol) || u.hostname.includes('-pooler.') ||
      digest(u.hostname) !== RESTORE_REUSE_TARGET.endpointSha256 || u.pathname !== '/neondb' ||
      digest(u.username) !== '6f198191100386e1f0c093fc1c902c0520c6382059d75fb4743ec1ec75cc7842' ||
      !u.password || u.port && u.port !== '5432' || !['require','verify-full'].includes(u.searchParams.get('sslmode') ?? '') || u.hash ||
      [...u.searchParams.keys()].some(k => !['sslmode','channel_binding'].includes(k))) fail('target rejected');
  for (const sha of [plan.beforeSha256, plan.sourceArchiveSha256, plan.retainedCopy.archiveSha256]) if (!/^[a-f0-9]{64}$/.test(sha)) fail('digest required');
  if (!plan.consumers.bindingsComplete || plan.consumers.consumers.length || !Number.isFinite(Date.parse(plan.consumers.reviewedAt)) ||
      Date.parse(plan.consumers.reviewedAt) > now || Date.parse(plan.consumers.expiresAt) <= now ||
      !Number.isFinite(Date.parse(plan.consumers.expiresAt)) || Date.parse(plan.consumers.expiresAt) - Date.parse(plan.consumers.reviewedAt) > 3600000) fail('current consumer clearance required');
  if (!plan.retainedCopy.independentlyRestored || plan.retainedCopy.archiveSha256 !== plan.retainedCopy.verifiedDownloadSha256) fail('verified retained copy required');
  if (authorization !== 'RESET-ISOLATED-DATABASE:' + canonicalHash(plan)) fail('explicit reset authorization required');
}

/** Adapters must target this one database. No branch-reset or database-create primitive exists. */
export async function reuseRestoreTarget(io: {
  guard(): void; archiveSha256(): Promise<string>; beforeSha256(): Promise<string>;
  expectedArchiveSha256: string; expectedBeforeSha256: string;
  activeConsumers(): Promise<number>; resetPublicAndDrizzle(): Promise<void>;
  isEmpty(): Promise<boolean>; restore(): Promise<void>; verify(): Promise<boolean>;
}) {
  io.guard();
  if (await io.archiveSha256() !== io.expectedArchiveSha256) fail('source archive drift');
  if (await io.beforeSha256() !== io.expectedBeforeSha256) fail('destination drift');
  if (await io.activeConsumers() !== 0) fail('active consumers');
  io.guard(); await io.resetPublicAndDrizzle();
  if (!await io.isEmpty()) fail('destination not empty after authorized reset');
  io.guard(); await io.restore();
  if (!await io.verify()) fail('restored verification failed; retain evidence and stop');
  return { existingDatabaseReused: true, databaseCreated: false, verified: true };
}
