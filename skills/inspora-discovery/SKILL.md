---
name: inspora-discovery
description: Find and refine Inspora references for inspiration searches, browsing and shortlisting.
---

# Inspora discovery

## Start with search

Finding useful references is Inspora's primary purpose. Search directly for examples, links, browsing and refinements, including broad requests. Use the project's existing context; describing a project does not by itself request guidance. Ask for clarification only when a missing fact would materially change the search. Otherwise, proceed with the available context and state any consequential assumption briefly.

Use `inspora-design-direction` when the user asks to choose or compare directions, develop a brief, or apply references to their project. Natural-language intent is enough; the user need not name the skill. Keep ordinary searches and follow-ups in search mode. Guidance is secondary and does not need a mode-selection prompt or an interview before results.

## Find and refine

- Translate the request into `search_inspiration` arguments using its schema. Separate the artifact from style and industry. Use primary-subject matching for the artifact itself and contained-feature matching for a detail within a larger work.
- Check `interpreted_query` against the request. Correct a tool misunderstanding. Ask about a consequential ambiguity in the user's intent.
- For a visual direction, search the project subject across relevant kinds, then the nearest domain or function and missing reference roles. A website project can use design entries for composition, product presentation or ordering, as well as websites and identity work. Exact artifact requests remain constrained. Fill useful gaps before adding more examples of an already-covered role.
- Read `search_coverage`: a query scans the eligible catalog but its kinds and constraints can exclude useful angles. Check vocabulary and scope before concluding that the catalog has nothing suitable. Use complementary searches for actual evidence gaps; deduplicate results and stop once those gaps are covered or useful evidence runs out.
- For more under the same criteria, use each group's `next_cursor`. For refinement, send a self-contained query retaining the artifact, project and unchanged constraints; “simpler” changes density, not the artifact. Start fresh for changed criteria or an expired cursor, and exclude earlier IDs when unseen work is wanted.
- Fetch selected details or previews with `get_work` when needed. Base visual claims on images actually inspected and identify evidence limits.

## Separate direct matches from adaptations

Show up to **10 direct references**, honoring another requested count. Direct means supported relevance to the requested subject or use case; label each work's role so an identity reference is not mistaken for a complete layout. Use columns **Reference / creator**, **Role**, **Why relevant**.

When direct coverage is sparse, search purposefully for up to **5 adaptation references** in a separate table, unless the user wants exact matches only. Favor nearby domains and shared functions before distant aesthetics. Use columns **Reference / creator**, **What to borrow**, **How to adapt it for this project**. Explain the concrete transfer and its scope limit; generic colors, large headings or a plausible story are insufficient. Inspect previews when visual compatibility is uncertain; withhold candidates whose usefulness remains unsupported.

Credit and link every work. Curate distinct useful references across the search pool; these counts are targets, not quotas or per-query allocations. State when either group has fewer or none. A shortage never justifies filler, changed mandatory constraints or calling an adaptation a direct match. A reason arguing against using the reference is grounds to exclude it.

## Continue only when useful

When a follow-up offers visual directions to choose from, illustrate each with two relevant Inspora works. Give their titles, creator credits and links, with a short note explaining what each example demonstrates. Prefer results already shown; retrieve additional examples only to fill a useful evidence gap. If fewer strong examples are available, say so and show the supported ones.

A closing question earns its place only when its answer would change the next useful step. Use plain language and concrete reasons, with design terms explained briefly when needed. A completed search can end with its results.
