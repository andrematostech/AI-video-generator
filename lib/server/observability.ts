import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { buildProjectPaths } from "@/lib/server/filesystem";
import { mapRows, runDatabaseRead, runDatabaseWrite } from "@/lib/server/database";
import { PipelineStepLog } from "@/lib/types";

type PipelineStepName = PipelineStepLog["stepName"];

type StepLogRow = {
  id: number;
  job_id: string;
  step_name: PipelineStepLog["stepName"];
  status: PipelineStepLog["status"];
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata_json: string | null;
};

function mapStepLogRow(row: StepLogRow): PipelineStepLog {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    stepName: row.step_name,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    errorMessage: row.error_message ?? undefined,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined
  };
}

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

  const id = await runDatabaseWrite((db) => {
    db.run(
      `
        INSERT INTO pipeline_step_logs (
          job_id,
          step_name,
          status,
          started_at,
          ended_at,
          duration_ms,
          error_message,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        params.jobId,
        params.stepName,
        "running",
        now,
        null,
        null,
        null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now,
        now
      ]
    );

    const row = mapRows<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
    return Number(row[0]?.id ?? 0);
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

  await runDatabaseWrite((db) => {
    db.run(
      `
        UPDATE pipeline_step_logs
        SET
          status = ?,
          ended_at = ?,
          duration_ms = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        "completed",
        endedAt,
        durationMs,
        params.metadata ? JSON.stringify(params.metadata) : null,
        endedAt,
        params.id
      ]
    );
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

  await runDatabaseWrite((db) => {
    db.run(
      `
        UPDATE pipeline_step_logs
        SET
          status = ?,
          ended_at = ?,
          duration_ms = ?,
          error_message = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        "failed",
        endedAt,
        durationMs,
        params.errorMessage,
        params.metadata ? JSON.stringify(params.metadata) : null,
        endedAt,
        params.id
      ]
    );
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
  return runDatabaseRead((db) => {
    const rows = mapRows<StepLogRow>(
      db,
      `
        SELECT *
        FROM pipeline_step_logs
        WHERE job_id = ?
        ORDER BY id ASC
      `,
      [jobId]
    );

    return rows.map(mapStepLogRow);
  });
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
