# Auth Modal Route Interception

**Scope:** `preview/archive-updates` only. Production and `main` remain untouched.

## Decision

Public navigation to `/sign-in` or `/sign-up` uses Next.js intercepted routes in the existing `@modal` parallel slot. The current public page remains mounted with its scroll position and UI state intact. A fixed transparent layer applies the existing 5px backdrop blur, and the Clerk card renders above it.

Direct URL visits continue to use the canonical auth pages and their deterministic standalone backdrop. This preserves refresh, bookmarks, Clerk callbacks, and server redirects such as the admin sign-in return flow.

## Interaction and verification

The public header uses a Next.js link so normal in-app navigation activates interception. Clicking inside the Clerk dialog remains inert; clicking outside calls browser Back, with `/` as the no-history fallback. Focused component tests cover the link and overlay boundary, and a local browser check verifies that the real page remains mounted and dismissal restores it.
