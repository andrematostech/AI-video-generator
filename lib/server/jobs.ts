import { access } from "node:fs/promises";
import { buildProjectPaths } from "@/lib/server/filesystem";
import {
  mapFirstRow,
  mapRows,
  runDatabaseRead,
  runDatabaseWrite
} from "@/lib/server/database";
import { readPipelineStepLogs } from "@/lib/server/observability";
import {
  GeneratedAsset,
  VideoPerformanceMetrics,
  VideoJobResult,
  VideoJobStatus,
  VideoMetadata,
  VideoScene
} from "@/lib/types";

type JobRow = {
  id: string;
  prompt: string;
  status: VideoJobStatus;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  error: string | null;
  title: string;
  script: string;
  target_duration_seconds: number;
  current_step: string;
  completed_scenes: number;
  total_scenes: number;
  narration_audio_path: string | null;
  subtitle_path: string | null;
  output_video_path: string;
  assets_directory: string;
  video_metadata_json: string | null;
  performance_metrics_json: string | null;
};

type SceneRow = {
  job_id: string;
  scene_index: number;
  narration: string;
  video_prompt: string;
  duration_seconds: number;
  clip_path: string | null;
};

type AssetRow = {
  id: number;
  job_id: string;
  scene_index: number | null;
  asset_type: GeneratedAsset["assetType"];
  file_path: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

type JobSummaryRow = {
  id: string;
  status: VideoJobStatus;
  updated_at: string;
};

function buildBaseJob(params: {
  id: string;
  prompt: string;
  assetsDirectory: string;
  maxAttempts?: number;
}): VideoJobResult {
  const now = new Date().toISOString();
  const maxAttempts = params.maxAttempts ?? 3;

  return {
    id: params.id,
    prompt: params.prompt,
    status: "queued",
    attemptCount: 0,
    maxAttempts,
    createdAt: now,
    updatedAt: now,
    title: "",
    script: "",
    targetDurationSeconds: 0,
    scenes: [],
    progress: {
      completedScenes: 0,
      totalScenes: 0,
      currentStep: "Queued for background processing"
    },
    narrationAudioPath: undefined,
    subtitlePath: undefined,
    outputVideoPath: "",
    assetsDirectory: params.assetsDirectory,
    videoMetadata: undefined,
    generatedAssets: [],
    stepLogs: []
  };
}

function parseVideoMetadata(value: string | null): VideoMetadata | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<VideoMetadata>;

    if (
      typeof parsed.title !== "string" ||
      typeof parsed.shortDescription !== "string" ||
      !Array.isArray(parsed.tags) ||
      typeof parsed.generationTimestamp !== "string" ||
      typeof parsed.originalPrompt !== "string"
    ) {
      return undefined;
    }

    return {
      title: parsed.title,
      shortDescription: parsed.shortDescription,
      tags: parsed.tags.map((tag) => String(tag)),
      generationTimestamp: parsed.generationTimestamp,
      originalPrompt: parsed.originalPrompt
    };
  } catch {
    return undefined;
  }
}

function parsePerformanceMetrics(
  value: string | null
): VideoPerformanceMetrics | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<VideoPerformanceMetrics>;

    if (typeof parsed.recordedAt !== "string") {
      return undefined;
    }

    return {
      scriptGenerationMs:
        typeof parsed.scriptGenerationMs === "number" ? parsed.scriptGenerationMs : undefined,
      scenePlanningMs:
        typeof parsed.scenePlanningMs === "number" ? parsed.scenePlanningMs : undefined,
      videoGenerationMs:
        typeof parsed.videoGenerationMs === "number" ? parsed.videoGenerationMs : undefined,
      narrationGenerationMs:
        typeof parsed.narrationGenerationMs === "number"
          ? parsed.narrationGenerationMs
          : undefined,
      subtitleGenerationMs:
        typeof parsed.subtitleGenerationMs === "number"
          ? parsed.subtitleGenerationMs
          : undefined,
      renderingMs: typeof parsed.renderingMs === "number" ? parsed.renderingMs : undefined,
      metadataGenerationMs:
        typeof parsed.metadataGenerationMs === "number"
          ? parsed.metadataGenerationMs
          : undefined,
      totalPipelineMs:
        typeof parsed.totalPipelineMs === "number" ? parsed.totalPipelineMs : undefined,
      recordedAt: parsed.recordedAt
    };
  } catch {
    return undefined;
  }
}

function mapSceneRow(row: SceneRow): VideoScene {
  return {
    sceneIndex: Number(row.scene_index),
    narration: row.narration,
    videoPrompt: row.video_prompt,
    durationSeconds: Number(row.duration_seconds),
    clipPath: row.clip_path ?? undefined
  };
}

function mapAssetRow(row: AssetRow): GeneratedAsset {
  return {
    id: Number(row.id),
    assetType: row.asset_type,
    jobId: row.job_id,
    sceneIndex: row.scene_index ?? undefined,
    filePath: row.file_path,
    sourceUrl: row.source_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapJobRecord(job: JobRow, scenes: SceneRow[], assets: AssetRow[]): VideoJobResult {
  return {
    id: job.id,
    prompt: job.prompt,
    status: job.status,
    attemptCount: Number(job.attempt_count),
    maxAttempts: Number(job.max_attempts),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    error: job.error ?? undefined,
    title: job.title,
    script: job.script,
    targetDurationSeconds: Number(job.target_duration_seconds),
    scenes: scenes.map(mapSceneRow).sort((a, b) => a.sceneIndex - b.sceneIndex),
    progress: {
      completedScenes: Number(job.completed_scenes),
      totalScenes: Number(job.total_scenes),
      currentStep: job.current_step
    },
    narrationAudioPath: job.narration_audio_path ?? undefined,
    subtitlePath: job.subtitle_path ?? undefined,
    outputVideoPath: job.output_video_path,
    assetsDirectory: job.assets_directory,
    videoMetadata: parseVideoMetadata(job.video_metadata_json),
    performanceMetrics: parsePerformanceMetrics(job.performance_metrics_json),
    generatedAssets: assets.map(mapAssetRow),
    stepLogs: []
  };
}

async function persistScenes(jobId: string, scenes: VideoScene[]) {
  const now = new Date().toISOString();

  await runDatabaseWrite((db) => {
    db.run("DELETE FROM scenes WHERE job_id = ?", [jobId]);

    for (const scene of scenes) {
      db.run(
        `
          INSERT INTO scenes (
            job_id,
            scene_index,
            narration,
            video_prompt,
            duration_seconds,
            clip_path,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          jobId,
          scene.sceneIndex,
          scene.narration,
          scene.videoPrompt,
          scene.durationSeconds,
          scene.clipPath ?? null,
          now,
          now
        ]
      );
    }
  });
}

async function upsertGeneratedAsset(params: {
  jobId: string;
  assetType: GeneratedAsset["assetType"];
  filePath: string;
  sceneIndex?: number;
  sourceUrl?: string;
}) {
  const now = new Date().toISOString();

  await runDatabaseWrite((db) => {
    db.run(
      `
        DELETE FROM generated_assets
        WHERE job_id = ?
          AND asset_type = ?
          AND COALESCE(scene_index, -1) = COALESCE(?, -1)
      `,
      [params.jobId, params.assetType, params.sceneIndex ?? null]
    );

    db.run(
      `
        INSERT INTO generated_assets (
          job_id,
          scene_index,
          asset_type,
          file_path,
          source_url,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        params.jobId,
        params.sceneIndex ?? null,
        params.assetType,
        params.filePath,
        params.sourceUrl ?? null,
        now,
        now
      ]
    );
  });
}

export async function recordGeneratedAsset(params: {
  jobId: string;
  assetType: GeneratedAsset["assetType"];
  filePath: string;
  sceneIndex?: number;
  sourceUrl?: string;
}) {
  await upsertGeneratedAsset(params);
}

async function persistAssetMetadata(jobId: string, job: Partial<VideoJobResult>) {
  if (job.scenes) {
    for (const scene of job.scenes) {
      if (scene.clipPath) {
        await upsertGeneratedAsset({
          jobId,
          assetType: "scene_clip",
          filePath: scene.clipPath,
          sceneIndex: scene.sceneIndex
        });
      }
    }
  }

  if (job.narrationAudioPath) {
    await upsertGeneratedAsset({
      jobId,
      assetType: "narration_audio",
      filePath: job.narrationAudioPath
    });
  }

  if (job.subtitlePath) {
    await upsertGeneratedAsset({
      jobId,
      assetType: "subtitle_file",
      filePath: job.subtitlePath
    });
  }

  if (job.outputVideoPath) {
    await upsertGeneratedAsset({
      jobId,
      assetType: "final_video",
      filePath: job.outputVideoPath
    });
  }
}

async function readJobGraph(jobId: string) {
  const jobGraph = await runDatabaseRead((db) => {
    const job = mapFirstRow<JobRow>(
      db,
      "SELECT * FROM jobs WHERE id = ?",
      [jobId]
    );

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const scenes = mapRows<SceneRow>(
      db,
      "SELECT * FROM scenes WHERE job_id = ? ORDER BY scene_index ASC",
      [jobId]
    );

    const assets = mapRows<AssetRow>(
      db,
      "SELECT * FROM generated_assets WHERE job_id = ? ORDER BY id ASC",
      [jobId]
    );

    return mapJobRecord(job, scenes, assets);
  });

  const stepLogs = await readPipelineStepLogs(jobId);

  return {
    ...jobGraph,
    stepLogs
  };
}

export async function readVideoJob(jobId: string) {
  return readJobGraph(jobId);
}

export async function readVideoJobOutputPath(jobId: string) {
  const job = await readVideoJob(jobId);

  if (!job.outputVideoPath) {
    throw new Error("Final video is not available for this job yet.");
  }

  await access(job.outputVideoPath);
  return job.outputVideoPath;
}

export async function createVideoJob(params: {
  id: string;
  prompt: string;
  assetsDirectory: string;
  maxAttempts?: number;
}) {
  const job = buildBaseJob(params);

  await runDatabaseWrite((db) => {
    db.run(
      `
        INSERT INTO jobs (
          id,
          prompt,
          status,
          attempt_count,
          max_attempts,
          created_at,
          updated_at,
          error,
          title,
          script,
          target_duration_seconds,
          current_step,
          completed_scenes,
          total_scenes,
          narration_audio_path,
          subtitle_path,
          output_video_path,
          assets_directory,
          video_metadata_json,
          performance_metrics_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        job.id,
        job.prompt,
        job.status,
        job.attemptCount,
        job.maxAttempts,
        job.createdAt,
        job.updatedAt,
        job.error ?? null,
        job.title,
        job.script,
        job.targetDurationSeconds,
        job.progress.currentStep,
        job.progress.completedScenes,
        job.progress.totalScenes,
        job.narrationAudioPath ?? null,
        job.subtitlePath ?? null,
        job.outputVideoPath,
        job.assetsDirectory,
        job.videoMetadata ? JSON.stringify(job.videoMetadata) : null,
        job.performanceMetrics ? JSON.stringify(job.performanceMetrics) : null
      ]
    );
  });

  return readVideoJob(job.id);
}

export async function updateVideoJob(
  jobId: string,
  updates: Partial<Omit<VideoJobResult, "id" | "createdAt" | "assetsDirectory" | "generatedAssets" | "stepLogs">> & {
    status?: VideoJobStatus;
  }
) {
  const currentJob = await readVideoJob(jobId);
  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as typeof updates;
  const nextJob: VideoJobResult = {
    ...currentJob,
    ...normalizedUpdates,
    updatedAt: new Date().toISOString(),
    generatedAssets: currentJob.generatedAssets,
    stepLogs: currentJob.stepLogs
  };

  await runDatabaseWrite((db) => {
    db.run(
      `
        UPDATE jobs
        SET
          prompt = ?,
          status = ?,
          attempt_count = ?,
          max_attempts = ?,
          updated_at = ?,
          error = ?,
          title = ?,
          script = ?,
          target_duration_seconds = ?,
          current_step = ?,
          completed_scenes = ?,
          total_scenes = ?,
          narration_audio_path = ?,
          subtitle_path = ?,
          output_video_path = ?,
          assets_directory = ?,
          video_metadata_json = ?,
          performance_metrics_json = ?
        WHERE id = ?
      `,
      [
        nextJob.prompt,
        nextJob.status,
        nextJob.attemptCount,
        nextJob.maxAttempts,
        nextJob.updatedAt,
        nextJob.error ?? null,
        nextJob.title,
        nextJob.script,
        nextJob.targetDurationSeconds,
        nextJob.progress.currentStep,
        nextJob.progress.completedScenes,
        nextJob.progress.totalScenes,
        nextJob.narrationAudioPath ?? null,
        nextJob.subtitlePath ?? null,
        nextJob.outputVideoPath,
        nextJob.assetsDirectory,
        nextJob.videoMetadata ? JSON.stringify(nextJob.videoMetadata) : null,
        nextJob.performanceMetrics ? JSON.stringify(nextJob.performanceMetrics) : null,
        jobId
      ]
    );
  });

  if (normalizedUpdates.scenes) {
    await persistScenes(jobId, normalizedUpdates.scenes);
  }

  await persistAssetMetadata(jobId, normalizedUpdates);

  return readVideoJob(jobId);
}

export async function markVideoJobFailed(jobId: string, error: string) {
  return updateVideoJob(jobId, {
    status: "failed",
    error,
    progress: {
      completedScenes: 0,
      totalScenes: 0,
      currentStep: "Job failed"
    }
  });
}

export async function listJobsForCleanup(params: {
  updatedBeforeIso: string;
}) {
  return runDatabaseRead((db) =>
    mapRows<JobSummaryRow>(
      db,
      `
        SELECT id, status, updated_at
        FROM jobs
        WHERE updated_at < ?
          AND status IN ('completed', 'failed')
        ORDER BY updated_at ASC
      `,
      [params.updatedBeforeIso]
    )
  );
}

export async function removeGeneratedAssetsForJob(params: {
  jobId: string;
  assetTypes: GeneratedAsset["assetType"][];
}) {
  await runDatabaseWrite((db) => {
    for (const assetType of params.assetTypes) {
      db.run(
        "DELETE FROM generated_assets WHERE job_id = ? AND asset_type = ?",
        [params.jobId, assetType]
      );
    }
  });
}

export async function clearJobTemporaryArtifactReferences(jobId: string) {
  await runDatabaseWrite((db) => {
    db.run(
      `
        UPDATE jobs
        SET
          narration_audio_path = NULL,
          subtitle_path = NULL
        WHERE id = ?
      `,
      [jobId]
    );

    db.run(
      `
        UPDATE scenes
        SET clip_path = NULL
        WHERE job_id = ?
      `,
      [jobId]
    );
  });
}
