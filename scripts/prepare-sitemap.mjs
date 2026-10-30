import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Older builds generated this ignored file. It would shadow/conflict with the
// live /sitemap.xml metadata route when an existing checkout is built again.
await rm(resolve(process.cwd(), "public", "sitemap.xml"), { force: true });
