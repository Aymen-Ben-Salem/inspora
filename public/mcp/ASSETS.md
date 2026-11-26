# MCP Preview page assets

- `references/` contains resized copies (720px and 360px WebP) of public Inspora archive artwork, paired with creator credits and work links in `src/components/inspiration/mcp-examples.json`. The five example sets are searches recorded with the hosted Inspora plugin on November 25, 2026 (first six results each; for "Dashboards", the next result replaces one whose preview was nearly blank). Where a video's poster frame was blank, a representative frame from the same public video is used. No artwork was generated or redrawn. The hero demo shows four of these sets with work titles only, not linked; the fifth set (logos and icons) is used only by the temporary `/mcp-previous` comparison page and can be removed with it.
- `study/` contains three frames from the public video of "Invite code interaction" by Nitish Khagwal, at 0.3s, 1.0s and 1.6s, illustrating the motion frames the plugin returns. The palette shown beside them is the plugin's measured result for the same work.
- `icons/` contains the Claude Code and OpenAI marks. Exact sources and licenses are recorded in `icons/icons-credits.json`. These are integration identifiers, not endorsements.
- Page motion uses GSAP (already a site dependency), loaded only by this route's client components, and is skipped for visitors who prefer reduced motion.

This page and its assets are for Preview review.
