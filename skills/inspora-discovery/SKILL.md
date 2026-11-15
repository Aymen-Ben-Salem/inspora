---
name: inspora-discovery
description: Find and refine Inspora references. Use for inspiration searches, guided discovery and shortlisting.
---

# Inspora discovery

## Choose the pace

Use the project's existing context. A clear request for examples or links selects direct search. A request to help define the direction selects guided discovery. Otherwise, offer that choice once per new task. Carry the choice through follow-ups and let the user switch at any time.

In guided mode, ask the highest-value unanswered question about the artifact, purpose, audience, constraints or visual preferences. Resolve prerequisites before dependent decisions. Find available facts yourself and leave preferences to the user. Offer varied starting points when helpful, with room for their own answer. Search once the answers can improve the results, or whenever the user asks to see examples.

## Find and refine

- Translate the request into `search_inspiration` arguments using its schema. Separate the artifact from style and industry. Use primary-subject matching for the artifact itself and contained-feature matching for a detail within a larger work.
- Check `interpreted_query` against the request. Correct a tool misunderstanding. Ask about a consequential ambiguity in the user's intent.
- Review candidates against the full brief using their catalog evidence or inspected previews. Show all qualifying works with credit, links and a supported reason they help. Six is the default target, not a quota: omit unsuitable work and explain the shortfall, including zero useful matches. A reason that argues against using the reference is grounds to exclude it.
- For more under the same criteria, use `next_cursor`. For refinement, send a self-contained query retaining the artifact, project and unchanged constraints; “simpler” changes density, not the artifact. Start fresh for changed criteria or an expired cursor, and exclude earlier IDs when unseen work is wanted. Ask before broadening the brief; a shortage is not permission to search increasingly unrelated directions.
- Fetch selected details or previews with `get_work` when needed. Base visual claims on images actually inspected and identify evidence limits.

## Continue only when useful

When a follow-up offers visual directions to choose from, illustrate each with two relevant Inspora works. Give their titles, creator credits and links, with a short note explaining what each example demonstrates. Prefer results already shown; retrieve additional examples only to fill a useful evidence gap. If fewer strong examples are available, say so and show the supported ones.

A closing question earns its place when it resolves a specific uncertainty, helps compare a real choice or advances the user's stated task. Ground it in the conversation and results. Keep other directions open. A completed request can end with its results.
