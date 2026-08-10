import {
  loadProductionMediaEnvironment,
  parseExecutionOptions,
} from "./lib/production-environment";
import { cleanupR2Orphans } from "./lib/media-migration/runner";

cleanupR2Orphans(
  loadProductionMediaEnvironment(),
  parseExecutionOptions(),
).catch((error) => {
  console.error("R2 orphan cleanup failed.", error);
  process.exitCode = 1;
});
