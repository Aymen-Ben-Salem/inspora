// Shared model-facing definitions for the hosted (cloudflare/http.mjs) and local (server.mjs)
// servers. Descriptions state mechanics only; the usage contract lives in instructions.mjs and
// curation/presentation in the client skills. The detail tools are defined in visuals.mjs.
import {z} from 'zod';
import {searchSchema} from './search.mjs';

export const searchTool={
  title:'Find Inspora inspiration',
  description:[
    'Search Inspora designs, websites, logos and icons with an English brief (query) or by similarity to an Inspora work link (reference_url).',
    'Only explicit arguments filter (kinds, subjects as any-of, subject_scope, filters, required_terms, exclude_terms, exclude_ids); context and text cues only rank.',
    'interpreted_query: derived_constraints lists text cues (reference_brands like "Linear" inform meaning only; enforced lists kinds inferred from kind words); subject_fallbacks lists broader subject readings; brief_terms the words judged; related_context_labels nearby domains.',
    'The tool reports evidence, not fit. results[].match is the strongest evidence tier: subject, contains (supporting feature), broader (a concept or word inside the subject), related, similar (meaning only), brief (no subject asked or the inferred subject is missing), browse.',
    'results[].evidence: subject {matched_as: literal, alias, derived, contained, broader, semantic or none; where: title, description, tags or notes; via: the broader reading}; context {matched, related, unverified}, style {matched, unverified}; brief_terms {matched, missing}; topic, role, mentions_excluded, dense_layout; media (video or image; videos rank first for motion requests); meaning_top_pct (catalog percentile for the brief); description and visual_notes (may describe another frame). reason summarizes it. Decide direct versus adaptation from this evidence and the previews.',
    'search_coverage counts evidence across the search: subject_matches (and weaker_subject_matches), or brief_matches without a subject; context_matches (every context part), context_related, style_matches (every requested style), term_matches (most brief terms). insufficient_matches is true when that subject or brief count is below count; notice states what is missing.',
    'For more results under the same constraints, call again with next_cursor; a re-read returns the same page until continuation_expires_at (15 minutes).',
    'Errors give a code and recovery step; rate limits add retry_after.',
  ].join(' '),
  inputSchema:searchSchema,
};

export const catalogStatusTool={
  title:'Check Inspora catalog status',
  description:'Report catalog freshness (captured_at), work counts per kind, search_revision and limits without searching. Use it for setup checks and freshness questions. catalog_state ready means search and details work; updating means retry after retry_after_seconds; stale or unavailable means search is paused. A local snapshot reports synchronization health instead. No administrative operations.',
  inputSchema:z.object({}).strict(),
};
