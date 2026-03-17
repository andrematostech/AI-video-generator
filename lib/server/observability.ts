import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { buildProjectPaths } from "@/lib/server/filesystem";
import { runDatabaseRead, runDatabaseWrite } from "@/lib/server/database";
import { PipelineStepLog, VideoPerformanceMetrics } from "@/lib/types";

type PipelineStepName = PipelineStepLog["stepName"];

async function appendStepLogFile(jobId: string, payload: Record<string, unknown>) {
  const directories = buildProjectPaths(jobId);
  const logsDirectory = path.join(directories.rootDirectory, "logs");
  await mkdir(logsDirectory, { recursive: true });
  const logPath = path.join(logsDirectory, "pipeline.log.jsonl");
  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function startPipelineStepLog(params: {
  jobId: string;
  stepName: PipelineStepName;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();

  const id = await runDatabaseWrite((store) => {
    store.counters.pipelineStepLogId += 1;
    store.pipelineStepLogs.push({
      id: store.counters.pipelineStepLogId,
      jobId: params.jobId,
      stepName: params.stepName,
      status: "running",
      startedAt: now,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now
    });

    return store.counters.pipelineStepLogId;
  });

  await appendStepLogFile(params.jobId, {
    event: "step_started",
    stepName: params.stepName,
    startedAt: now,
    metadata: params.metadata ?? null
  });

  return {
    id,
    startedAt: now
  };
}

export async function completePipelineStepLog(params: {
  id: number;
  jobId: string;
  stepName: PipelineStepName;
  startedAt: string;
  metadata?: Record<string, unknown>;
}) {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(params.startedAt).getTime();

  await runDatabaseWrite((store) => {
    const log = store.pipelineStepLogs.find((entry) => entry.id === params.id);

    if (!log) {
      throw new Error(`Pipeline step log not found: ${params.id}`);
    }

    log.status = "completed";
    log.endedAt = endedAt;
    log.durationMs = durationMs;
    log.metadata = params.metadata;
    log.updatedAt = endedAt;
  });

  await appendStepLogFile(params.jobId, {
    event: "step_completed",
    stepName: params.stepName,
    startedAt: params.startedAt,
    endedAt,
    durationMs,
    metadata: params.metadata ?? null
  });
}

export async function failPipelineStepLog(params: {
  id: number;
  jobId: string;
  stepName: PipelineStepName;
  startedAt: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
}) {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(params.startedAt).getTime();

  await runDatabaseWrite((store) => {
    const log = store.pipelineStepLogs.find((entry) => entry.id === params.id);

    if (!log) {
      throw new Error(`Pipeline step log not found: ${params.id}`);
    }

    log.status = "failed";
    log.endedAt = endedAt;
    log.durationMs = durationMs;
    log.errorMessage = params.errorMessage;
    log.metadata = params.metadata;
    log.updatedAt = endedAt;
  });

  await appendStepLogFile(params.jobId, {
    event: "step_failed",
    stepName: params.stepName,
    startedAt: params.startedAt,
    endedAt,
    durationMs,
    errorMessage: params.errorMessage,
    metadata: params.metadata ?? null
  });
}

export async function readPipelineStepLogs(jobId: string) {
  return runDatabaseRead((store) =>
    store.pipelineStepLogs
      .filter((log) => log.jobId === jobId)
      .sort((a, b) => a.id - b.id)
      .map((log) => ({
        id: log.id,
        jobId: log.jobId,
        stepName: log.stepName,
        status: log.status,
        startedAt: log.startedAt,
        endedAt: log.endedAt,
        durationMs: log.durationMs,
        errorMessage: log.errorMessage,
        metadata: log.metadata
      }))
  );
}

function getStepDuration(
  stepLogs: PipelineStepLog[],
  stepName: PipelineStepLog["stepName"]
) {
  return stepLogs.find((log) => log.stepName === stepName)?.durationMs;
}

export function buildPerformanceMetrics(
  stepLogs: PipelineStepLog[]
): VideoPerformanceMetrics {
  const startedAtValues = stepLogs.map((log) => new Date(log.startedAt).getTime());
  const endedAtValues = stepLogs
    .filter((log) => log.endedAt)
    .map((log) => new Date(log.endedAt as string).getTime());

  const totalPipelineMs =
    startedAtValues.length > 0 && endedAtValues.length > 0
      ? Math.max(0, Math.max(...endedAtValues) - Math.min(...startedAtValues))
      : undefined;

  return {
    scriptGenerationMs: getStepDuration(stepLogs, "script_generation"),
    scenePlanningMs: getStepDuration(stepLogs, "scene_planning"),
    videoGenerationMs: getStepDuration(stepLogs, "video_clip_generation"),
    narrationGenerationMs: getStepDuration(stepLogs, "narration_generation"),
    subtitleGenerationMs: getStepDuration(stepLogs, "subtitle_generation"),
    renderingMs: getStepDuration(stepLogs, "ffmpeg_rendering"),
    metadataGenerationMs: getStepDuration(stepLogs, "metadata_generation"),
    totalPipelineMs,
    recordedAt: new Date().toISOString()
  };
}

export async function tracePipelineStep<T>(params: {
  jobId: string;
  stepName: PipelineStepName;
  metadata?: Record<string, unknown>;
  run: () => Promise<T>;
  onSuccessMetadata?: (result: T) => Record<string, unknown> | undefined;
}) {
  const started = await startPipelineStepLog({
    jobId: params.jobId,
    stepName: params.stepName,
    metadata: params.metadata
  });

  try {
    const result = await params.run();
    await completePipelineStepLog({
      id: started.id,
      jobId: params.jobId,
      stepName: params.stepName,
      startedAt: started.startedAt,
      metadata: params.onSuccessMetadata?.(result)
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected pipeline step failure.";

    await failPipelineStepLog({
      id: started.id,
      jobId: params.jobId,
      stepName: params.stepName,
      startedAt: started.startedAt,
      errorMessage: message,
      metadata: params.metadata
    });

    throw error;
  }
}
