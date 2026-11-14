# Try Inspora in Claude Code or Codex

Find design inspiration through your AI assistant. The hosted team trial runs on Cloudflare and receives content updates automatically. Current Inspora team/admin accounts can connect; customer access waits for the Inspora Pro plans and credits work.

## Ask your agent to set it up

Copy this prompt into Codex or Claude Code.

```text
Set up Inspora for me.

1. Add https://mcp.inspora.design/mcp as a Streamable HTTP MCP server and sign me in through OAuth if needed.
2. Install inspora-discovery and inspora-design-direction from Aymen-Ben-Salem/inspora for my current agent using npx skills add.
3. Check catalog_status, then find six examples for a design idea I give you.
```

The two skills help with guided discovery, refining searches, comparing references and developing a design direction. The skills installer uses Node.js. The hosted MCP connection can also be set up directly below.

## Connect directly

If your client has an MCP server URL field, add **Inspora** with this address.

```text
https://mcp.inspora.design/mcp
```

Or use your client's terminal command.

**Codex**

```sh
codex mcp add inspora --url https://mcp.inspora.design/mcp
```

If sign-in already opened and succeeded, continue. Run `codex mcp login inspora` when sign-in is still needed or access needs renewing.

**Claude Code**

```sh
claude mcp add --transport http --scope user inspora https://mcp.inspora.design/mcp
claude mcp login inspora
```

## Sign in

Sign in to Inspora in the browser and choose **Allow connection**. Reopen your AI session if Inspora does not appear yet. No project folder, Node installation, model download or access file is needed for this hosted connection.

## Add the companion skills

For Codex, run this once. For Claude Code, replace `codex` with `claude-code`.

```sh
npx skills add Aymen-Ben-Salem/inspora --skill inspora-discovery inspora-design-direction -g -a codex -y
```

Start a fresh agent session after installation. Existing users can run `npx skills update inspora-discovery inspora-design-direction` when they want the latest skill guidance. [Skills installer reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)

## Try a search

After setup, ask for a design idea.

> Use Inspora to find six dark website hero sections with bold typography. Include links.

Ask for more detail about any result, or share an Inspora link to find similar work. Uploaded reference images are planned for Phase 2.

After setup, use your AI client normally. New works, corrections and server-side search improvements arrive automatically. Your AI client's normal model usage still applies. This team trial does not charge customer credits.

If setup fails, share the error with the team and remove credentials and callback URLs. The user confirmed both setup paths worked on a second PC. [Hosted technical notes](cloudflare/README.md) and the [earlier local baseline](MAINTAINER.md) are for maintainers.
