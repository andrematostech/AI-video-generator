import path from "node:path";
import { readdir, rm, stat } from "node:fs/promises";
import { getServerEnv } from "@/lib/config/env.server";
import { pruneDatabaseJobs } from "@/lib/server/database";
import { buildProjectPaths } from "@/lib/server/filesystem";
import {
  clearJobTemporaryArtifactReferences,
  listJobsForCleanup,
  readVideoJob,
  removeGeneratedAssetsForJob,
  updateVideoJob
} from "@/lib/server/jobs";

type CleanupConfig = {
  enabled: boolean;
  intervalMs: number;
  tempFileTtlMs: number;
  keepFinalVideos: boolean;
  keepLatestJobs: number;
};

const TEMP_ASSET_TYPES = [
  "scene_clip",
  "narration_audio",
  "subtitle_file",
  "rendered_scene"
] as const;

export function getCleanupConfig(): CleanupConfig {
  const env = getServerEnv();

  return {
    enabled: env.CLEANUP_ENABLED !== "false",
    intervalMs: Math.max(1, Number(env.CLEANUP_INTERVAL_MINUTES || "30")) * 60 * 1000,
    tempFileTtlMs: Math.max(1, Number(env.CLEANUP_TEMP_FILE_TTL_HOURS || "24")) * 60 * 60 * 1000,
    keepFinalVideos: env.CLEANUP_KEEP_FINAL_VIDEOS !== "false",
    keepLatestJobs: Math.max(1, Number(env.CLEANUP_MAX_JOBS || "3"))
  };
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeDirectoryIfPresent(directoryPath: string) {
  if (await pathExists(directoryPath)) {
    await rm(directoryPath, { recursive: true, force: true });
  }
}

async function removeFileIfPresent(filePath: string) {
  if (await pathExists(filePath)) {
    await rm(filePath, { force: true });
  }
}

async function cleanupJobArtifacts(jobId: string, keepFinalVideos: boolean) {
  const job = await readVideoJob(jobId);
  const directories = buildProjectPaths(jobId);

  await removeDirectoryIfPresent(directories.clipsDirectory);
  await removeDirectoryIfPresent(directories.audioDirectory);
  await removeDirectoryIfPresent(directories.subtitlesDirectory);
  await removeDirectoryIfPresent(directories.renderDirectory);

  await removeGeneratedAssetsForJob({
    jobId,
    assetTypes: [...TEMP_ASSET_TYPES]
  });

  await clearJobTemporaryArtifactReferences(jobId);

  const updates: Parameters<typeof updateVideoJob>[1] = {};

  if (!keepFinalVideos && job.outputVideoPath) {
    await removeFileIfPresent(job.outputVideoPath);
    await removeGeneratedAssetsForJob({
      jobId,
      assetTypes: ["final_video"]
    });
    updates.outputVideoPath = "";
  }

  if (Object.keys(updates).length > 0) {
    await updateVideoJob(jobId, updates);
  }
}

async function cleanupOrphanedQueueDirectories() {
  const env = getServerEnv();
  const queueRoot = path.join(env.ASSETS_DIR, ".queue");

  if (!(await pathExists(queueRoot))) {
    return;
  }

  const entries = await readdir(queueRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryPath = path.join(queueRoot, entry.name);
    const stats = await stat(directoryPath);
    const ageMs = Date.now() - stats.mtimeMs;

    if (ageMs > getCleanupConfig().tempFileTtlMs) {
      await rm(directoryPath, { recursive: true, force: true });
    }
  }
}

export async function runCleanupNow() {
  const config = getCleanupConfig();

  if (!config.enabled) {
    return {
      cleanedJobCount: 0
    };
  }

  const updatedBeforeIso = new Date(Date.now() - config.tempFileTtlMs).toISOString();
  const jobs = await listJobsForCleanup({
    updatedBeforeIso
  });

  for (const job of jobs) {
    await cleanupJobArtifacts(job.id, config.keepFinalVideos);
  }

  await cleanupOrphanedQueueDirectories();
  await pruneDatabaseJobs({
    keepLatestJobs: config.keepLatestJobs
  });

  return {
    cleanedJobCount: jobs.length
  };
}

export function startCleanupScheduler() {
  const config = getCleanupConfig();

  if (!config.enabled) {
    return () => undefined;
  }

  void runCleanupNow();

  const intervalId = setInterval(() => {
    void runCleanupNow();
  }, config.intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}
