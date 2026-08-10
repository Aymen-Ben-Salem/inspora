import { loadProductionMediaEnvironment } from "./lib/production-environment";
import { verifyR2Migration } from "./lib/media-migration/runner";

const args = process.argv.slice(2);
const unknown = args.filter((argument) => argument !== "--allow-remaining");

if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
}

verifyR2Migration(loadProductionMediaEnvironment(), {
  allowRemaining: args.includes("--allow-remaining"),
}).catch((error) => {
  console.error("R2 media verification failed.", error);
  process.exitCode = 1;
});
