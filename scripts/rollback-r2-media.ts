import {
  loadProductionMediaEnvironment,
  parseExecutionOptions,
} from "./lib/production-environment";
import { rollbackR2Migration } from "./lib/media-migration/runner";

rollbackR2Migration(
  loadProductionMediaEnvironment(),
  parseExecutionOptions(),
).catch((error) => {
  console.error("R2 media rollback failed.", error);
  process.exitCode = 1;
});
