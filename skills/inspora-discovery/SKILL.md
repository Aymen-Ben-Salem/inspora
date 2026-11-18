---
name: inspora-discovery
description: Find and refine Inspora references for inspiration searches, browsing and shortlisting.
---

# Inspora discovery

## Establish the search direction

Finding useful references is Inspora's primary purpose. First distinguish a search direction from a format or sharing goal. "A small UI piece", "components or sections" and "to post on X" describe format, size or destination; they do not establish what to explore. Words such as "interesting", "cool" or "beautiful" do not select a fresh mix on the user's behalf.

When only that open creative brief is available, ask one light question before calling `search_inspiration`: "Do you have a component type or visual style in mind, or would you like a fresh mix of ideas?" End the turn and wait for the answer. Then search without an interview. Search immediately when the conversation already establishes a concrete subject, function, visual style or project brief, or the user explicitly requests a fresh mix, surprise or no questions. Reuse context; this clarification is not a consultation.

Use `inspora-design-direction` when the user asks to choose or compare directions, develop a brief, or apply references to their project. Natural-language intent is enough; the user need not name the skill. Keep ordinary searches and follow-ups in search mode. Guidance is secondary and does not need a mode-selection prompt or an interview before results.

## Find and refine

- Translate the request into `search_inspiration` arguments using its schema. Use concise subject names, separating the main artifact from optional features, style and industry. Keep mandatory requirements in the filters. Use primary-subject matching for the artifact itself and contained-feature matching for a detail within a larger work. Broader nearby-domain queries supply adaptations.
- Check `interpreted_query` against the request. Correct a tool misunderstanding. Ask about a consequential ambiguity in the user's intent.
- For project-reference requests as well as visual directions, search the project subject across relevant kinds, then nearby domains and the functions or sections the project needs. A website project can use design entries for composition, product presentation or ordering, as well as websites and identity work. Cover these useful angles in the first response, rather than waiting for the user to complain about a short list. Exact artifact requests remain constrained.
- Read `search_coverage`: a query scans the eligible catalog but its kinds and constraints can exclude useful angles. Check vocabulary and scope before concluding that the catalog has nothing suitable. Use complementary searches for actual evidence gaps; deduplicate results. Before ending below the reference target, check relevant unexplored roles and available continuation for promising candidates. Stop when the target is supported or reasonable relevant searches yield no further useful work; never expand mandatory constraints to fill a count.
- For more under the same criteria, use each group's latest `next_cursor` once. On `CURSOR_USED`, use the newest cursor you received. Start fresh if you have none and exclude earlier IDs when unseen work is wanted. For refinement, retain the artifact, project and unchanged constraints.
- Inspect shortlisted works before making visual recommendations. Use `get_works` when available to retrieve up to six stills in one call, or `get_work` with `preview=image` for individual works. Link useful description-only references with that evidence limit. Follow retry timing from a rate-limited response and reuse fetched previews.

## Separate direct matches from adaptations

When inspecting search coverage, distinguish works admitted by kind or category from works that actually fit the brief. A meditation logo search can surface shapes worth adapting even when the catalog has no confirmed wellness identity. If `interpreted_query.unavailable_filter_values` lists a technology, explain that the current catalog has no work tagged with that value. Use a separate design-reference search only when the implementation technology is optional.

Aim to show **10 qualifying direct references**, honoring another requested count. Five is not the default shortlist size. Check each candidate against the original brief, even when a search used soft context. Direct means evidence of the requested subject or function, beyond belonging to the same broad industry. Nearby products belong in adaptations unless they independently meet the requested use case. Exact-only requests include confirmed matches only. Label each work's role so an identity reference is not mistaken for a complete layout. For an open component/section search, varied components and sections are direct matches, not adaptations just because they differ in subject. Use columns **Reference / creator**, **Role**, **Why relevant**.

When direct coverage is sparse, search purposefully for up to **5 adaptation references** in a separate table, unless the user wants exact matches only. Favor nearby domains and shared functions before distant aesthetics. Use columns **Reference / creator**, **What to borrow**, **How to adapt it for this project**. Explain the concrete transfer and its scope limit; generic colors, large headings or a plausible story are insufficient. Inspect previews when visual compatibility is uncertain; withhold candidates whose usefulness remains unsupported.

Credit and link every work. Count inline recommendations toward the same group's limit. Curate distinct useful references across the search pool; these counts are targets, not quotas or per-query allocations. State when either group has fewer or none. A shortage never justifies filler, changed mandatory constraints or calling an adaptation a direct match. A reason arguing against using the reference is grounds to exclude it.

## Continue only when useful

When a follow-up offers visual directions to choose from, illustrate each with two relevant Inspora works. Give their titles, creator credits and links, with a short note explaining what each example demonstrates. Prefer results already shown; retrieve additional examples only to fill a useful evidence gap. If fewer strong examples are available, say so and show the supported ones.

A closing question earns its place only when its answer would change the next useful step. Use plain language and concrete reasons, with design terms explained briefly when needed. Use commas or separate sentences instead of em dashes. A completed search can end with its results.
