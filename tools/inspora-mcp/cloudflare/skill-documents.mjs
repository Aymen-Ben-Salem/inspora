import {sha} from '../catalog.mjs';

// Only explicitly bundled skill documents are published. No repository or
// filesystem lookup happens while serving an installation request.
export function createSkillDocuments(sources, setupHtml) {
  const skills = sources.map(content => {
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const name = frontmatter.match(/^name: ([a-z0-9-]+)\r?$/m)?.[1];
    const description = frontmatter.match(/^description: (.+)\r?$/m)?.[1]?.trim();
    if (!name || !description) throw Error('Invalid bundled skill metadata');
    return {name, description, content};
  });
  const resources = new Map();
  const add = (path, body, type) => resources.set(path, {body, type, etag: '"' + sha(body) + '"'});
  const index = JSON.stringify({skills: skills.map(({name, description}) => ({name, description, files: ['SKILL.md']}))});
  for (const prefix of ['/.well-known/agent-skills', '/.well-known/skills']) {
    add(prefix + '/index.json', index, 'application/json; charset=utf-8');
    for (const skill of skills) add(prefix + '/' + skill.name + '/SKILL.md', skill.content, 'text/markdown; charset=utf-8');
  }
  add('/setup', setupHtml, 'text/html; charset=utf-8');

  return request => {
    const url = new URL(request.url);
    const resource = resources.get(url.pathname);
    if (!resource) return null;
    if (url.search) return new Response('Not found', {status: 404});
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
    const headers = {
      'Content-Type': resource.type,
      'Cache-Control': 'public, max-age=300',
      'ETag': resource.etag,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    };
    if (request.headers.get('if-none-match') === resource.etag) return new Response(null, {status: 304, headers});
    return new Response(request.method === 'HEAD' ? null : resource.body, {headers});
  };
}
