import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { loadPreviewEnvironment } from "./preview-environment";
import { assertEnvironmentFingerprint, APPROVED_ENVIRONMENT_FINGERPRINTS } from "./environment-fingerprint";
import { assertProductionMediaEnvironment } from "./production-environment";
import { canonicalHash } from "./content-transfer-plan";

export function parseTransferArguments(args: string[]) {
  let mode: "dry-run" | "apply" | "cleanup" = "dry-run";
  let newOnly = false;
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--new-only") {
      if (newOnly) throw new Error("Transfer usage: duplicate --new-only.");
      newOnly = true;
    } else if (arg === "--apply" || arg === "--cleanup") {
      if (mode !== "dry-run") throw new Error("Transfer usage: choose one write mode.");
      mode = arg === "--apply" ? "apply" : "cleanup";
    } else if (["--manifest", "--sha256", "--evidence-dir", "--output"].includes(arg)) {
      if (values[arg] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Transfer usage: invalid option.");
      values[arg] = args[++i];
    } else throw new Error("Transfer usage: unknown option.");
  }
  if (mode !== "dry-run" && (!values["--manifest"] || !/^[a-f0-9]{64}$/.test(values["--sha256"] ?? ""))) throw new Error("Transfer usage: writes require --manifest and --sha256.");
  if (newOnly && mode === "cleanup") throw new Error("Transfer usage: --new-only cannot delete content.");
  return { mode, newOnly, manifest: values["--manifest"], sha256: values["--sha256"], evidenceDir: values["--evidence-dir"] ?? ".scratch/release-preparation", output: values["--output"] };
}
export function assertManifestPin(raw: string, pin: string) {
  if (!/^[a-f0-9]{64}$/.test(pin) || createHash("sha256").update(raw).digest("hex") !== pin) throw new Error("Transfer manifest digest mismatch.");
}
// Identities used by the independently read/verified Phase 2 databases and R2 inventories.
const APPROVED_TRANSFER_IDENTITY = {
  account: "d19b0d507749c034433331f3896624a73db7a5400db69670fd2e2f5e5611e53e",
  database: "779b9128cc47c655a4238bf48b53ad3a3ce3c5226b05a1703b880e7cde5c0837",
};
export function assertTransferIdentity(environment: { r2AccountId: string; databaseUrl: string; databaseUrlUnpooled?: string }, expected = APPROVED_TRANSFER_IDENTITY) {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  if (hash(environment.r2AccountId) !== expected.account || [environment.databaseUrl, environment.databaseUrlUnpooled ?? environment.databaseUrl].some(url => hash(new URL(url).pathname) !== expected.database)) throw new Error("Transfer account/database identity does not match the audited resources.");
}
export function loadContentTransferEnvironment() {
  const values = parse(readFileSync(".env.production.local"));
  const source = { dataEnvironment: values.DATA_ENVIRONMENT, databaseUrl: values.DATABASE_URL, databaseUrlUnpooled: values.DATABASE_URL_UNPOOLED, r2AccountId: values.R2_ACCOUNT_ID, r2AccessKeyId: values.R2_ACCESS_KEY_ID, r2SecretAccessKey: values.R2_SECRET_ACCESS_KEY, r2BucketName: values.R2_BUCKET_NAME, r2PublicBaseUrl: values.R2_PUBLIC_BASE_URL };
  assertProductionMediaEnvironment(source);
  const preview = loadPreviewEnvironment();
  const endpoint = (url: string) => new URL(url).hostname.replace("-pooler.", ".");
  const guard = () => {
    assertEnvironmentFingerprint(preview, APPROVED_ENVIRONMENT_FINGERPRINTS.preview);
    assertProductionMediaEnvironment(source);
    assertTransferIdentity(source);
    assertTransferIdentity(preview);
    if (endpoint(source.databaseUrl) === endpoint(preview.databaseUrl) || source.r2BucketName === preview.r2BucketName || source.r2PublicBaseUrl === preview.r2PublicBaseUrl) throw new Error("Transfer environments are not distinct.");
  };
  guard();
  const fingerprint = (environment: typeof source) => canonicalHash({ endpoint: endpoint(environment.databaseUrl), database: new URL(environment.databaseUrl).pathname, bucket: environment.r2BucketName, publicHost: new URL(environment.r2PublicBaseUrl).host, account: environment.r2AccountId });
  return { source, preview, guard, sourceFingerprint: fingerprint(source), destinationFingerprint: fingerprint(preview) };
}
