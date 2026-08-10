import {
  loadProductionMediaEnvironment,
  parseExecutionOptions,
} from "./lib/production-environment";
import { migrateCloudinaryToR2 } from "./lib/media-migration/runner";

migrateCloudinaryToR2(
  loadProductionMediaEnvironment(),
  parseExecutionOptions(),
).catch((error) => {
  console.error("R2 media migration failed.", error);
  process.exitCode = 1;
});
