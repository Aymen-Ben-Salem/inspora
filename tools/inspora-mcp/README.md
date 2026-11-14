# Try Inspora in Claude Code or Codex

Find design inspiration through your AI assistant. The hosted team trial runs on Cloudflare and receives content updates automatically. Current Inspora team/admin accounts can connect; customer access waits for the Inspora Pro plans and credits work.

## 1. Connect your client

If your client has an MCP server URL field, add **Inspora** with:

```text
https://inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev/mcp
```

Or use your client's terminal command:

**Codex**

```sh
codex mcp add inspora --url https://inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev/mcp
codex mcp login inspora
```

**Claude Code**

```sh
claude mcp add --transport http --scope user inspora https://inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev/mcp
claude mcp login inspora
```

## 2. Sign in

Sign in to Inspora in the browser and choose **Allow connection**. Reopen your AI session if Inspora does not appear yet. No project folder, Node installation, model download or access file is needed for this hosted connection.

## 3. Try a search

After setup, ask:

> Use Inspora to find six dark website hero sections with bold typography. Include links.

Ask for more detail about any result, or share an Inspora link to find similar work. Uploaded reference images are planned for Phase 2.

**After setup:** use your AI client normally. New works and corrections arrive automatically; you do not need to reinstall or refresh Inspora. Your AI client's normal model usage still applies. This team trial does not charge customer credits.

**Stuck?** Share the error with the team, removing credentials and callback URLs. First-use validation on two machines is still pending. [Hosted technical notes](cloudflare/README.md) and the [earlier local baseline](MAINTAINER.md) are for maintainers.
