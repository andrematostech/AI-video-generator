import { startWorkerLoop } from "@/lib/server/worker";

startWorkerLoop().catch((error) => {
  console.error("Worker exited with an error.");
  console.error(error);
  process.exit(1);
});
