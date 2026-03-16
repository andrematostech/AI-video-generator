import { processVideoJob } from "@/lib/server/pipeline";
import {
  claimNextVideoJob,
  completeClaimedVideoJob,
  moveClaimedVideoJobToFailed,
  retryClaimedVideoJob
} from "@/lib/server/queue";
import { markVideoJobFailed, updateVideoJob } from "@/lib/server/jobs";

const DEFAULT_POLL_INTERVAL_MS = 1500;

export async function processQueueOnce() {
  const claimed = await claimNextVideoJob();

  if (!claimed) {
    return false;
  }

  const { item, processingPath } = claimed;

  try {
    await updateVideoJob(item.jobId, {
      attemptCount: item.attempt,
      maxAttempts: item.maxAttempts,
      error: undefined,
      progress: {
        completedScenes: 0,
        totalScenes: 0,
        currentStep: `Worker started attempt ${item.attempt} of ${item.maxAttempts}`
      }
    });

    await processVideoJob(item.jobId, item.prompt);
    await completeClaimedVideoJob(processingPath);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while processing queued job.";

    if (item.attempt < item.maxAttempts) {
      await updateVideoJob(item.jobId, {
        status: "queued",
        attemptCount: item.attempt,
        maxAttempts: item.maxAttempts,
        error: message,
        progress: {
          completedScenes: 0,
          totalScenes: 0,
          currentStep: `Retrying soon after attempt ${item.attempt} failed`
        }
      });

      await retryClaimedVideoJob(item, processingPath);
      return true;
    }

    await updateVideoJob(item.jobId, {
      attemptCount: item.attempt,
      maxAttempts: item.maxAttempts
    });
    await markVideoJobFailed(item.jobId, message);
    await moveClaimedVideoJobToFailed(item, processingPath, message);
  }

  return true;
}

export async function startWorkerLoop(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  let shouldStop = false;

  const stop = () => {
    shouldStop = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!shouldStop) {
    const didWork = await processQueueOnce();

    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
