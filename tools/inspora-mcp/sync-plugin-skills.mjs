// Copies the canonical skills (repo skills/<name>/SKILL.md) into the Claude Code
// plugin (plugins/inspora/skills/<name>/SKILL.md) byte for byte. skills/ stays
// the single source of truth; never edit the plugin copies by hand.
//   node sync-plugin-skills.mjs          write the copies
//   node sync-plugin-skills.mjs --check  exit 1 when the copies differ
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sourceSkillsDir = join(repoRoot, 'skills');
export const pluginRoot = join(repoRoot, 'plugins', 'inspora');
export const pluginSkillsDir = join(pluginRoot, 'skills');

const skillNames = dir => existsSync(dir)
  ? readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md'))).map(e => e.name).sort()
  : [];

// Returns human-readable differences between skills/ and the plugin copies.
export function skillDrift() {
  const source = skillNames(sourceSkillsDir), plugin = skillNames(pluginSkillsDir), drift = [];
  for (const name of source) {
    const target = join(pluginSkillsDir, name, 'SKILL.md');
    if (!existsSync(target)) drift.push('missing plugin copy: ' + name);
    else if (!readFileSync(join(sourceSkillsDir, name, 'SKILL.md')).equals(readFileSync(target))) drift.push('plugin copy differs: ' + name);
  }
  for (const name of plugin) if (!source.includes(name)) drift.push('stale plugin skill: ' + name);
  if (existsSync(pluginSkillsDir)) for (const name of skillNames(pluginSkillsDir)) {
    const extra = readdirSync(join(pluginSkillsDir, name)).filter(file => file !== 'SKILL.md');
    if (extra.length) drift.push('unexpected files in plugin skill ' + name + ': ' + extra.join(', '));
  }
  return drift;
}

export function syncSkills() {
  const source = skillNames(sourceSkillsDir);
  if (!source.length) throw Error('No skills found in ' + sourceSkillsDir);
  for (const name of skillNames(pluginSkillsDir)) if (!source.includes(name)) rmSync(join(pluginSkillsDir, name), {recursive: true});
  for (const name of source) {
    mkdirSync(join(pluginSkillsDir, name), {recursive: true});
    writeFileSync(join(pluginSkillsDir, name, 'SKILL.md'), readFileSync(join(sourceSkillsDir, name, 'SKILL.md')));
  }
  return source;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) {
  if (process.argv.includes('--check')) {
    const drift = skillDrift();
    if (drift.length) { console.error(drift.join('\n') + '\nRun: node tools/inspora-mcp/sync-plugin-skills.mjs'); process.exit(1); }
    console.log('Plugin skills match skills/.');
  } else console.log('Synced plugin skills: ' + syncSkills().join(', '));
}
