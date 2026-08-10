import {
  loadProductionMediaEnvironment,
  parseExecutionOptions,
} from "./lib/production-environment";
import { cleanupCloudinary } from "./lib/media-migration/runner";

cleanupCloudinary(
  loadProductionMediaEnvironment(),
  parseExecutionOptions(),
).catch((error) => {
  console.error("Cloudinary cleanup failed.", error);
  process.exitCode = 1;
});
