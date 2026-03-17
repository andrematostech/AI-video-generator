import { access } from "node:fs/promises";
import { runDatabaseRead, runDatabaseWrite } from "@/lib/server/database";
import { readPipelineStepLogs } from "@/lib/server/observability";
import {
  GeneratedAsset,
  VideoJobResult,
  VideoJobStatus,
  VideoScene
} from "@/lib/types";

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
    performanceMetrics: undefined,
    generatedAssets: [],
    stepLogs: []
  };
}

function cloneScenes(jobId: string, scenes: VideoScene[]) {
  const now = new Date().toISOString();

  return scenes.map((scene) => ({
    jobId,
    sceneIndex: scene.sceneIndex,
    narration: scene.narration,
    videoPrompt: scene.videoPrompt,
    durationSeconds: scene.durationSeconds,
    clipPath: scene.clipPath,
    createdAt: now,
    updatedAt: now
  }));
}

async function readJobGraph(jobId: string) {
  const jobGraph = await runDatabaseRead((store) => {
    const job = store.jobs.find((entry) => entry.id === jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const scenes = store.scenes
      .filter((scene) => scene.jobId === jobId)
      .sort((a, b) => a.sceneIndex - b.sceneIndex)
      .map((scene) => ({
        sceneIndex: scene.sceneIndex,
        narration: scene.narration,
        videoPrompt: scene.videoPrompt,
        durationSeconds: scene.durationSeconds,
        clipPath: scene.clipPath
      }));

    const generatedAssets = store.generatedAssets
      .filter((asset) => asset.jobId === jobId)
      .sort((a, b) => a.id - b.id)
      .map((asset) => ({
        id: asset.id,
        assetType: asset.assetType,
        jobId: asset.jobId,
        sceneIndex: asset.sceneIndex,
        filePath: asset.filePath,
        sourceUrl: asset.sourceUrl,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt
      }));

    return {
      ...job,
      scenes,
      generatedAssets
    } satisfies Omit<VideoJobResult, "stepLogs">;
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

  await runDatabaseWrite((store) => {
    store.jobs = store.jobs.filter((entry) => entry.id !== job.id);
    store.jobs.push({
      ...job,
      generatedAssets: undefined as never,
      stepLogs: undefined as never,
      scenes: undefined as never
    });
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

  await runDatabaseWrite((store) => {
    const jobIndex = store.jobs.findIndex((entry) => entry.id === jobId);

    if (jobIndex < 0) {
      throw new Error(`Job not found: ${jobId}`);
    }

    store.jobs[jobIndex] = {
      id: nextJob.id,
      prompt: nextJob.prompt,
      status: nextJob.status,
      attemptCount: nextJob.attemptCount,
      maxAttempts: nextJob.maxAttempts,
      createdAt: nextJob.createdAt,
      updatedAt: nextJob.updatedAt,
      error: nextJob.error,
      title: nextJob.title,
      script: nextJob.script,
      targetDurationSeconds: nextJob.targetDurationSeconds,
      progress: nextJob.progress,
      narrationAudioPath: nextJob.narrationAudioPath,
      subtitlePath: nextJob.subtitlePath,
      outputVideoPath: nextJob.outputVideoPath,
      assetsDirectory: nextJob.assetsDirectory,
      videoMetadata: nextJob.videoMetadata,
      performanceMetrics: nextJob.performanceMetrics
    };

    if (normalizedUpdates.scenes) {
      store.scenes = store.scenes.filter((scene) => scene.jobId !== jobId);
      store.scenes.push(...cloneScenes(jobId, normalizedUpdates.scenes));
    }
  });

  await persistAssetMetadata(jobId, normalizedUpdates);

  return readVideoJob(jobId);
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

async function upsertGeneratedAsset(params: {
  jobId: string;
  assetType: GeneratedAsset["assetType"];
  filePath: string;
  sceneIndex?: number;
  sourceUrl?: string;
}) {
  const now = new Date().toISOString();

  await runDatabaseWrite((store) => {
    store.generatedAssets = store.generatedAssets.filter(
      (asset) =>
        !(
          asset.jobId === params.jobId &&
          asset.assetType === params.assetType &&
          (asset.sceneIndex ?? null) === (params.sceneIndex ?? null)
        )
    );

    store.counters.generatedAssetId += 1;
    store.generatedAssets.push({
      id: store.counters.generatedAssetId,
      jobId: params.jobId,
      sceneIndex: params.sceneIndex,
      assetType: params.assetType,
      filePath: params.filePath,
      sourceUrl: params.sourceUrl,
      createdAt: now,
      updatedAt: now
    });
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
  return runDatabaseRead((store) =>
    store.jobs
      .filter(
        (job) =>
          job.updatedAt < params.updatedBeforeIso &&
          (job.status === "completed" || job.status === "failed")
      )
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((job) => ({
        id: job.id,
        status: job.status,
        updated_at: job.updatedAt
      }))
  );
}

export async function removeGeneratedAssetsForJob(params: {
  jobId: string;
  assetTypes: GeneratedAsset["assetType"][];
}) {
  await runDatabaseWrite((store) => {
    store.generatedAssets = store.generatedAssets.filter(
      (asset) =>
        !(asset.jobId === params.jobId && params.assetTypes.includes(asset.assetType))
    );
  });
}

export async function clearJobTemporaryArtifactReferences(jobId: string) {
  await runDatabaseWrite((store) => {
    const job = store.jobs.find((entry) => entry.id === jobId);

    if (job) {
      job.narrationAudioPath = undefined;
      job.subtitlePath = undefined;
      job.updatedAt = new Date().toISOString();
    }

    store.scenes = store.scenes.map((scene) =>
      scene.jobId === jobId
        ? {
            ...scene,
            clipPath: undefined,
            updatedAt: new Date().toISOString()
          }
        : scene
    );
  });
}
