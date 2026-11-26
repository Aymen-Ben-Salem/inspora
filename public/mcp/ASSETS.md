# MCP Preview page assets

- `references/` contains resized copies (720px and 360px WebP) of public Inspora archive artwork, paired with creator credits and work links in `src/components/inspiration/mcp-examples.json`. The four hero searches (Dashboards, Micro-interactions, Landing pages, Onboarding) were recorded with the hosted Inspora plugin on November 26, 2026 and show the first ten results each, in order. For Onboarding, the eleventh result replaces the tenth, whose preview was nearly blank. For video works, the image is a frame from the same public video, either its poster or the still the plugin returned. No artwork was generated or redrawn. The hero shows work titles only, not linked. The logos-and-icons set (recorded November 25, six results) is used only by the temporary `/mcp-previous` comparison page and can be removed with it.
- `study/` contains three frames from the public video of "Invite code interaction" by Nitish Khagwal, at 0.3s, 1.0s and 1.6s, illustrating the motion frames the plugin returns. The palette shown beside them is the plugin's measured result for the same work. The 1.0s frame also appears, credited, in the "Credited and current" tile.
- `icons/` contains the Claude Code and OpenAI marks. Exact sources and licenses are recorded in `icons/icons-credits.json`. These are integration identifiers, not endorsements.
- The four "what it does" tiles are drawn with HTML and CSS; they contain no third-party artwork apart from the credited frame above.
- Page motion uses GSAP (already a site dependency), loaded only by this route's client components, and is skipped for visitors who prefer reduced motion.

This page and its assets are for Preview review.
