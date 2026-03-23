import { startCleanupScheduler } from "@/lib/server/cleanup";
import { buildPerformanceMetrics, readPipelineStepLogs } from "@/lib/server/observability";
import { processVideoJob } from "@/lib/server/pipeline";
import {
  claimNextVideoJob,
  completeClaimedVideoJob,
  enqueueVideoJob,
  listQueueItems,
  moveClaimedVideoJobToFailed,
  recoverProcessingQueueItems,
  retryClaimedVideoJob
} from "@/lib/server/queue";
import { isVideoJobCancelled, listQueuedVideoJobs, markVideoJobFailed, updateVideoJob } from "@/lib/server/jobs";

const DEFAULT_POLL_INTERVAL_MS = 1500;

function isMissingJobError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Job not found:");
}

function isCancelledJobError(error: unknown) {
  return error instanceof Error && error.message === "Job was cancelled by user.";
}

async function recoverQueueState() {
  const recoveredProcessingCount = await recoverProcessingQueueItems();

  if (recoveredProcessingCount > 0) {
    console.log(`[worker] Recovered ${recoveredProcessingCount} stale processing job(s).`);
  }

  const queueItems = await listQueueItems();
  const queuedJobs = await listQueuedVideoJobs();
  const queuedJobIds = new Set(queueItems.map((entry) => entry.item.jobId));
  let requeuedCount = 0;

  for (const job of queuedJobs) {
    if (queuedJobIds.has(job.id)) {
      continue;
    }

    await enqueueVideoJob({
      jobId: job.id,
      prompt: job.prompt,
      attempt: Math.max(1, job.attemptCount || 1),
      maxAttempts: job.maxAttempts,
      enqueuedAt: new Date().toISOString()
    });
    requeuedCount += 1;
  }

  if (requeuedCount > 0) {
    console.log(`[worker] Re-enqueued ${requeuedCount} persisted queued job(s).`);
  }
}

export async function processQueueOnce() {
  const claimed = await claimNextVideoJob();

  if (!claimed) {
    return false;
  }

  const { item, processingPath } = claimed;

  try {
    console.log(`[worker] Claimed job ${item.jobId} (attempt ${item.attempt}/${item.maxAttempts}).`);

    if (await isVideoJobCancelled(item.jobId)) {
      await completeClaimedVideoJob(processingPath);
      console.log(`[worker] Discarded cancelled job ${item.jobId}.`);
      return true;
    }

    await updateVideoJob(item.jobId, {
      attemptCount: item.attempt,
      maxAttempts: item.maxAttempts,
      progress: {
        completedScenes: 0,
        totalScenes: 0,
        currentStep: `Worker started attempt ${item.attempt} of ${item.maxAttempts}`
      }
    }, {
      clearError: true
    });

    await processVideoJob(item.jobId, item.prompt);
    await completeClaimedVideoJob(processingPath);
    console.log(`[worker] Completed job ${item.jobId}.`);
  } catch (error) {
    if (isMissingJobError(error)) {
      await completeClaimedVideoJob(processingPath);
      console.log(`[worker] Discarded orphaned queue item for missing job ${item.jobId}.`);
      return true;
    }

    if (isCancelledJobError(error) || (await isVideoJobCancelled(item.jobId))) {
      await completeClaimedVideoJob(processingPath);
      console.log(`[worker] Cancelled job ${item.jobId}.`);
      return true;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected error while processing queued job.";

    if (item.attempt < item.maxAttempts) {
      const performanceMetrics = buildPerformanceMetrics(
        await readPipelineStepLogs(item.jobId)
      );

      await updateVideoJob(item.jobId, {
        status: "queued",
        attemptCount: item.attempt,
        maxAttempts: item.maxAttempts,
        error: message,
        performanceMetrics,
        progress: {
          completedScenes: 0,
          totalScenes: 0,
          currentStep: `Retrying soon after attempt ${item.attempt} failed`
        }
      });

      await retryClaimedVideoJob(item, processingPath);
      console.error(
        `[worker] Job ${item.jobId} failed on attempt ${item.attempt}. Retrying. ${message}`
      );
      return true;
    }

    const performanceMetrics = buildPerformanceMetrics(
      await readPipelineStepLogs(item.jobId)
    );

    await updateVideoJob(item.jobId, {
      attemptCount: item.attempt,
      maxAttempts: item.maxAttempts,
      performanceMetrics
    });
    await markVideoJobFailed(item.jobId, message);
    await moveClaimedVideoJobToFailed(item, processingPath, message);
    console.error(`[worker] Job ${item.jobId} failed permanently. ${message}`);
  }

  return true;
}

export async function startWorkerLoop(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  let shouldStop = false;
  const stopCleanupScheduler = startCleanupScheduler();
  await recoverQueueState();
  console.log("[worker] Worker loop started.");

  const stop = () => {
    shouldStop = true;
    stopCleanupScheduler();
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
