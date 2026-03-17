import path from "node:path";
import { config as loadEnv } from "dotenv";
import { startWorkerLoop } from "@/lib/server/worker";

for (const envFile of [
  ".env.local",
  ".env"
]) {
  loadEnv({
    path: path.resolve(process.cwd(), envFile),
    override: false
  });
}

startWorkerLoop().catch((error) => {
  console.error("Worker exited with an error.");
  console.error(error);
  process.exit(1);
});
