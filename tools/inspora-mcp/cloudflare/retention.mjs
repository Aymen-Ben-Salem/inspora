const prefix='mcp/hosted/v1/indexes/';
export const RETENTION_MS=2*86400000;
// Bounded maintenance on the shared publisher, never on the search path.
export async function pruneIndexes(bucket,currentKey,cursor,now=Date.now()){
  const page=await bucket.list({prefix,limit:100,...(cursor?{cursor}:{})});
  const keys=page.objects.filter(object=>object.key!==currentKey&&/^mcp\/hosted\/v1\/indexes\/[a-f0-9]{64}\.json$/.test(object.key)&&Number.isFinite(+object.uploaded)&&+object.uploaded<now-RETENTION_MS).map(object=>object.key);
  if(keys.length)await bucket.delete(keys);
  return page.truncated?page.cursor:null;
}
