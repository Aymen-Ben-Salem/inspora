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
- Show all returned works with credit, links and grounded reasons. Default to six and explain genuine shortages. Honor the requested format and count.
- For more under the same criteria, use `next_cursor`. For a new direction or expired cursor, start fresh and exclude earlier IDs when the user wants unseen work. Preserve constraints until the user changes them. Ask before relaxing a mandatory constraint.
- Fetch selected details or previews with `get_work` when needed. Base visual claims on images actually inspected and identify evidence limits.

## Continue only when useful

A closing question earns its place when it resolves a specific uncertainty, helps compare a real choice or advances the user's stated task. Ground it in the conversation and results. Keep other directions open. A completed request can end with its results.
