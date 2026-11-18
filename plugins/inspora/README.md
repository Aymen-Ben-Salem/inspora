# Inspora plugin for Claude Code and Codex

Team-only. The plugin connects your agent to the hosted Inspora MCP at `https://mcp.inspora.design/mcp`. It also installs the `inspora-discovery` and `inspora-design-direction` skills. The plugin holds no credentials: each person still signs in through Inspora's team OAuth, and only approved team accounts get access.

Other agents keep the manual setup: add the MCP URL and run `npx skills add https://mcp.inspora.design -g --agent <agent> -y`. The guide for everyone is at [mcp.inspora.design/setup](https://mcp.inspora.design/setup).

## Claude Code

Install, in your shell (inside a session, use `/plugin marketplace add …` and `/plugin install …`):

```bash
claude plugin marketplace add Aymen-Ben-Salem/inspora#preview/archive-updates
claude plugin install inspora@inspora-team
```

On a machine without a GitHub SSH key, set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` first. From a local checkout, run `claude plugin marketplace add <path-to-repo>` instead.

Sign in: start Claude Code or run `/reload-plugins`, then `/mcp`, select `plugin:inspora:inspora`, choose **Authenticate** and **Allow connection** in the browser. The skills are `/inspora:inspora-discovery` and `/inspora:inspora-design-direction`; Claude also loads them on its own when a request matches.

Remove an earlier manual setup, so the old server isn't used instead of the plugin's and the skills aren't listed twice:

```bash
claude mcp remove inspora -s user
npx skills remove inspora-discovery inspora-design-direction -g -a claude-code -y
```

Update with `claude plugin marketplace update inspora-team` and `claude plugin update inspora@inspora-team`, then `/reload-plugins`. Uninstall with `claude plugin uninstall inspora@inspora-team` and `claude plugin marketplace remove inspora-team`.

## Codex

Install:

```bash
codex plugin marketplace add Aymen-Ben-Salem/inspora --ref preview/archive-updates
codex plugin add inspora@inspora-team
```

In the Codex app or an interactive session you can instead open `/plugins` after adding the marketplace. From a local checkout, run `codex plugin marketplace add <path-to-repo>`.

Remove an earlier manual setup; a manual `inspora` entry takes the place of the plugin's server:

```bash
codex mcp remove inspora
npx skills remove inspora-discovery inspora-design-direction -g -a codex -y
```

Sign in: `codex mcp list` should show `inspora` at `https://mcp.inspora.design/mcp`. If Auth says **Not logged in**, run `codex mcp login inspora`. Start a new session; the skills appear as `inspora:inspora-discovery` and `inspora:inspora-design-direction`.

Update with `codex plugin marketplace upgrade inspora-team` and then `codex plugin add inspora@inspora-team`. Uninstall with `codex plugin remove inspora@inspora-team` and `codex plugin marketplace remove inspora-team`.

## Maintainers

- One plugin directory serves both clients. Claude Code reads `.claude-plugin/plugin.json` and `.mcp.json`; Codex reads the portable `plugin.json` and `mcp.json` at the plugin root and `.agents/plugins/marketplace.json` at the repository root. `npm test` in `tools/inspora-mcp` fails when the two sets disagree.
- `skills/` at the repository root is the single source of truth for the skills. After you edit one, run `npm run sync:plugin-skills` in `tools/inspora-mcp`.
- Increase `version` in both `plugin.json` files for every release teammates should receive.
- Validate with `claude plugin validate ./plugins/inspora --strict` and `claude plugin validate . --strict`, and install into a throwaway `CODEX_HOME` with `codex plugin marketplace add <path-to-repo>` and `codex plugin add inspora@inspora-team`.
- Keep this plugin out of public plugin directories. The marketplace lives in a personal repository for the team trial; move it to a company-owned repository before any public launch.
