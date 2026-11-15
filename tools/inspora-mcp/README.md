# Set up Inspora

Find design references in your AI agent. The hosted team trial is available to approved Inspora team/admin accounts. Customer access will follow the Inspora Pro plans and credits work.

Choose **agent-assisted setup** or **manual setup**. The same instructions are available at [mcp.inspora.design/setup](https://mcp.inspora.design/setup).

## Ask your agent to set it up

Copy this prompt into the agent you use:

```text
Set up Inspora for me.

1. Connect https://mcp.inspora.design/mcp using Streamable HTTP and OAuth. Reuse an existing correct connection and sign me in if needed.
2. Install inspora-discovery and inspora-design-direction from https://mcp.inspora.design with npx skills add, using -g -y and an explicit --agent for my current client (codex, claude-code, or its supported installer ID).
3. Verify both installed skills are available to this agent, then call catalog_status through Inspora. Say "Inspora is ready" only when those checks succeed. If a check fails, explain the specific next step.
```

Complete the browser sign-in and choose **Allow connection**. The skills installer needs Node.js 22.20 or newer. If your agent cannot reload its skills or MCP tools in the current conversation, start a fresh conversation and ask it to finish the checks.

## Set up manually

### 1. Connect Inspora

In your agent's MCP settings, add this server URL:

```text
https://mcp.inspora.design/mcp
```

Sign in to Inspora and choose **Allow connection**. If this URL is already connected, continue to the skills step.

If you use a terminal, run the command for your installed client.

**Codex**
```sh
codex mcp add inspora --url https://mcp.inspora.design/mcp
```

If sign-in already opened and succeeded, continue. Otherwise run `codex mcp login inspora`.

**Claude Code**
```sh
claude mcp add --transport http --scope user inspora https://mcp.inspora.design/mcp
```

Run `claude mcp login inspora` if sign-in is needed. In an interactive Claude Code session, you can also authenticate through `/mcp`.

### 2. Install the skills

Choose your agent. These commands install or replace both Inspora skills for your user account, across projects.

**Codex**
```sh
npx skills add https://mcp.inspora.design -g --agent codex -y
```

**Claude Code**
```sh
npx skills add https://mcp.inspora.design -g --agent claude-code -y
```

For another agent, replace the value after `--agent` with its [supported installer ID](https://github.com/vercel-labs/skills/blob/main/docs/agents.md). For multiple agents, name them explicitly, such as `--agent codex claude-code`.

The installer needs [Node.js 22.20 or newer](https://nodejs.org/en/download). After installation, start a fresh agent conversation if the skills have not appeared.

### 3. Check and try it

Confirm **Inspora** is connected in your agent's MCP settings and **inspora-discovery** and **inspora-design-direction** appear in its available skills.

You can also check installed skill files in the terminal:

```sh
npx skills list -g --agent codex
```

For Claude Code, use `--agent claude-code`. A successful file listing confirms installation; the agent's available skills confirm it has loaded them.

Now ask:

> Use Inspora to find ten dark website hero sections with bold typography. Include links.

You should receive relevant references with creator credits and Inspora links, or an explanation if fewer strong matches are available. Search is the default. Ask for help choosing a visual direction, comparing references or developing a brief when you want guidance. Skills can be selected from that request automatically; mentioning their names is optional.

## If something needs attention

- **Inspora already exists:** check that its saved URL is `https://mcp.inspora.design/mcp`, then use that connection.
- **Sign-in required:** authenticate Inspora in your client's MCP settings. Existing users only need to sign in again when the client requests it.
- **Access denied:** the trial requires an approved Inspora team/admin account. Contact the team if you need access.
- **Command not found:** use the client's MCP settings if its CLI is unavailable. For `npx`, install the current Node.js LTS release and reopen your terminal.
- **Skills or MCP tools missing:** start a fresh conversation; restart the agent/extension if still missing. Repeat the relevant check.
- **PromptScript warning from an earlier attempt:** check whether both skills were installed for your intended agent. If needed, rerun the explicit agent command above.
- **Service unavailable:** retry later and share the error with the team, excluding credentials and callback URLs.

## Updates and next steps

New works and server-side search improvements arrive automatically. To refresh the locally installed skills, rerun your agent's skill-install command above. This also switches an earlier repository-based installation to the Inspora domain.

Ask for more results, compare selected references, or use an existing Inspora work link to find similar designs. Uploaded reference-image search remains planned for Phase 2. Your AI client's normal model usage applies; this team trial does not charge customer credits.

The `inspora-discovery` skill helps find and refine references. `inspora-design-direction` helps compare selected work and develop an original design direction.

[Hosted technical notes](cloudflare/README.md) and the [earlier local baseline](MAINTAINER.md) are for maintainers.
