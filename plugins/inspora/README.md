# Inspora plugin for Claude Code

Team-only. The plugin connects Claude Code to the hosted Inspora MCP at `https://mcp.inspora.design/mcp`. It also installs the `inspora-discovery` and `inspora-design-direction` skills. The plugin holds no credentials: each person still signs in through Inspora's team OAuth, and only approved team accounts get access.

Codex and other agents keep the existing setup: add the MCP URL and run `npx skills add https://mcp.inspora.design -g --agent <agent> -y`. See [mcp.inspora.design/setup](https://mcp.inspora.design/setup).

## Install

Run these commands in your shell (inside a Claude Code session, use `/plugin marketplace add …` and `/plugin install …`):

```bash
claude plugin marketplace add Aymen-Ben-Salem/inspora#preview/archive-updates
claude plugin install inspora@inspora-team
```

On a machine without a GitHub SSH key, set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` before you run these commands.

To install from a local checkout of this repository, run `claude plugin marketplace add <path-to-repo>` and then the same install command.

Then sign in:

1. Start Claude Code or run `/reload-plugins` in an open session.
2. Run `/mcp` and select the Inspora plugin server, which `claude mcp list` shows as `plugin:inspora:inspora`. Choose **Authenticate**, then sign in to Inspora in the browser and choose **Allow connection**.
3. Check it: ask Claude to find Inspora references for a landing page.

The skills are available as `/inspora:inspora-discovery` and `/inspora:inspora-design-direction`. Claude also loads them on its own when a request matches.

## Remove an earlier manual setup first

If you set Inspora up by hand before, remove that setup so the server and skills aren't listed twice:

```bash
claude mcp remove inspora -s user
npx skills remove inspora-discovery inspora-design-direction -g -a claude-code -y
```

The `skills remove` command removes only the Claude Code copies, so Codex keeps its skills. Run `claude mcp list` and `npx skills ls -g -a claude-code` to check that nothing is left. If you kept a manual `inspora` server, Claude Code connects to it instead of the plugin's server, because both use the same URL.

## Update

```bash
claude plugin marketplace update inspora-team
claude plugin update inspora@inspora-team
```

Then run `/reload-plugins` or restart Claude Code. Teammates receive a new release only when the plugin `version` changes. To get updates automatically, open `/plugin`, go to **Marketplaces**, select `inspora-team` and choose **Enable auto-update**.

## Uninstall

```bash
claude plugin uninstall inspora@inspora-team
claude plugin marketplace remove inspora-team
```

## Maintainers

- `skills/` at the repository root is the single source of truth. After you edit a skill, run `npm run sync:plugin-skills` in `tools/inspora-mcp`. `npm test` there fails when the plugin copies differ.
- Increase `version` in `.claude-plugin/plugin.json` for every release that teammates should receive.
- Validate with `claude plugin validate ./plugins/inspora` and `claude plugin validate .` from the repository root.
- Don't submit this plugin to Anthropic's public plugin directory. It is for the team only.
