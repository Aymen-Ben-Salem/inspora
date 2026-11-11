import fs from 'node:fs';
import path from 'node:path';
import {sha} from './catalog.mjs';

export function localPreview(row, manifest, mediaDirectory) {
  const entry = manifest.drafts?.find(d => d.id === row.id);
  if (!entry || !/^[A-Z]\d{2,3}$/.test(entry.label)) return {status: 'No locally prepared thumbnail; URL only'};
  if (entry.sourceVersion?.mediaMetadataSha256 !== sha(row.media)) return {status: 'Local thumbnail is stale; URL only'};
  const file = path.join(mediaDirectory, entry.label + '-thumb-0.png');
  if (!fs.existsSync(file)) return {status: 'Local thumbnail unavailable; URL only'};
  if (fs.statSync(file).size > 256000) return {status: 'Local thumbnail exceeds 256 KB; URL only'};
  return {bytes: fs.readFileSync(file)};
}
