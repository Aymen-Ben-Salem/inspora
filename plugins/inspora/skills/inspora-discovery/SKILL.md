---
name: inspora-discovery
description: Finds, curates and presents design references from the Inspora MCP. Use when the user asks for design inspiration, references, examples, a moodboard or similar work, or for UI, website, logo or icon ideas, even without naming Inspora.
---

# Inspora discovery

The server instructions set the contract: English queries, hard versus ranking arguments, honest shortages, credits. This skill is the workflow from request to shortlist.

## Workflow

1. **Clarify or search.** Search when the request or conversation establishes a subject, function, style or project, or the user asks for a surprise mix. When nothing says what to explore, ask one short question with two or three concrete directions plus "a surprise mix", then wait. *Done when* you have a search direction.
2. **Map the request to arguments.** Concise English `query`; `kinds` for the artifact types; `subjects` as short artifact names; `subject_scope: "contains"` for a feature inside a larger work; `context` for the industry; `filters`, `required_terms` and `exclude_terms` only for requirements the user stated. Subjects and "no X" written only in the query rank rather than filter, so pass them as `subjects` or `exclude_terms` when they are mandatory. See the examples.
3. **Check each reply.** Compare `interpreted_query` with the request: kinds (`derived_constraints.enforced` lists kinds inferred from kind words), subjects, scope, `reference_brands`, and `subject_fallbacks`, which names any broader reading of a subject. Rerun with explicit arguments when it misread. Read `search_coverage`: `subject_matches` (or `brief_matches` without a subject), `weaker_subject_matches`, `context_matches`, `context_related`, `style_matches`. *Done when* the kinds, subjects and scope used are the ones the user meant.
4. **Fill missing roles.** For a project, list the roles it needs (full layout, identity, components, iconography) and search each empty role: the subject itself, the nearest domain, the shared function. Pass `exclude_ids` for works already found. *Done when* the direct target is met, or each relevant role has had one search and the last searches added nothing useful.
5. **Classify and inspect.** The tool reports evidence, not fit: you decide which works are direct. Read each candidate's `evidence` and description, then call `get_works` on the shortlist (up to six per call) before describing visuals. Trust the attached image over `evidence.visual_notes`, which may describe another frame. For a motion reference that informs a build, call `get_work` with `detail: "study"` when its `preview.motion_sheets` is above 0.
6. **Present** with the template below. *Done when* every listed work is credited, linked and placed in the right table, and each shortage is stated.

## Curation

- **Direct references, up to 10:** works you confirm show the requested subject as the work itself, in the requested context and style. Start from `match: "subject"` (or `brief` and `browse` without a subject) and check `evidence`: `subject.matched_as` literal, alias or derived in the title or description is strong; `where: ["notes"]` only, or a low `meaning_top_pct`, needs the preview to confirm. Word senses collide (a button with a calendar icon is not a calendar; an iPod-shaped agent picker is not a music player), so read the description. With an explicit context, direct works show `context.matched` for each part (`interpreted_query.context_facets`) or are clearly that domain in the preview. For a style-led brief, direct works show the requested styles (`style.matched`); styles on a concrete subject only rank. For a motion or interaction request, a work whose `evidence.media` is `image` is at most an adaptation: say the motion is not shown. For an open component or section request, varied components are all direct.
- **Adaptations, up to 5,** in a separate table when direct coverage is short: nearby domains and shared functions first. Name what transfers and its limit. Works whose evidence shows a gap are adaptations: `contained`, `broader` or `semantic` subject evidence, an unverified context or style, or `related_domain` context. The right subject with an unverified context is often the best adaptation in a sparse domain. When `context_matches` is 0, say the exact domain is missing and name the related domains (`interpreted_query.related_context_labels`) the works come from.
- **Shortages** come from `search_coverage` and `notice`, which state what is missing. A count of 0 subject matches with weaker evidence available means "no exact match, these are close"; check the weaker works rather than calling it empty.
- **Exact-only requests** get confirmed matches only; offer adaptations in one sentence instead of a table.
- Honor any count the user gives. Counts are ceilings for quality: when supported works run out, show fewer and say so.
- Each work's role (identity, component, full layout) is part of its relevance: a logo is no evidence for a page layout.

## Examples

| Request | Arguments |
|---|---|
| "Show me some navigation bar ideas" | `{"query": "navigation bar", "kinds": ["design"], "subjects": ["navigation bar"]}` |
| "I'm building the website for an AI note-taking app" | Three searches, one per role: `{"query": "AI notes app landing page", "kinds": ["website"], "context": "AI productivity"}`, `{"query": "notes app interface", "kinds": ["design"], "context": "productivity"}`, `{"query": "app icon for a notes app", "kinds": ["icon"], "context": "productivity"}` |
| "Je cherche des idées d'écran de connexion minimaliste pour une application mobile" | `{"query": "minimal login screen for a mobile app", "kinds": ["design"], "subjects": ["login screen"]}`; reply in French |
| "Only real pricing tables, nothing else" | `{"query": "pricing table", "kinds": ["design"], "subjects": ["pricing table"]}`; if `subject_matches` is 0, say none exist and offer the `broader` or `contains` works as an option |

## Output template

```
**Direct references** (N of 10)
| Reference / creator | Role | Why relevant |
|---|---|---|
| [Title](Inspora link) by Creator | component | What it shows that fits the brief |
| **More available. Ask for more inspiration.** | | |

**Adaptations** (only when direct coverage is short)
| Reference / creator | What to borrow | How to adapt it for this project |
|---|---|---|

Shortage: one sentence on what the catalog lacks, when it does.
```

Add the "More available" row only when that table's search returned a `next_cursor`.

## More and refinements

- **"More"** under the same criteria: call `search_inspiration` with that table's latest `next_cursor` and show the next page only. A cursor can be re-read and expires 15 minutes after the original search; after that, rerun the search with `exclude_ids`.
- **`page_limited_by: "response_size"`** means the page was cut for size: fetch its `next_cursor` to complete the shortlist.
- **Changed criteria** start a new self-contained search that restates the artifact, project and unchanged constraints. "Simpler" changes density, not the artifact.
- When the user wants to choose a direction, compare options or build from the references, use `inspora-design-direction`.
