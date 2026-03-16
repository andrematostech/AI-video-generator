import path from "node:path";
import { access } from "node:fs/promises";
import {
  buildProjectPaths,
  ensureDirectories,
  readJson,
  writeJson
} from "@/lib/server/filesystem";
import { VideoJobResult, VideoJobStatus } from "@/lib/types";

export async function readVideoJob(jobId: string) {
  const directories = buildProjectPaths(jobId);
  return readJson<VideoJobResult>(path.join(directories.rootDirectory, "job.json"));
}

export async function readVideoJobOutputPath(jobId: string) {
  const job = await readVideoJob(jobId);

  if (!job.outputVideoPath) {
    throw new Error("Final video is not available for this job yet.");
  }

  await access(job.outputVideoPath);
  return job.outputVideoPath;
}

function buildBaseJob(params: {
  id: string;
  prompt: string;
  assetsDirectory: string;
}): VideoJobResult {
  const now = new Date().toISOString();

  return {
    id: params.id,
    prompt: params.prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    title: "",
    script: "",
    targetDurationSeconds: 0,
    scenes: [],
    progress: {
      completedScenes: 0,
      totalScenes: 0,
      currentStep: "queued"
    },
    narrationAudioPath: undefined,
    subtitlePath: undefined,
    outputVideoPath: "",
    assetsDirectory: params.assetsDirectory
  };
}

async function writeJob(job: VideoJobResult) {
  const directories = buildProjectPaths(job.id);
  await ensureDirectories([directories.rootDirectory]);
  await writeJson(path.join(directories.rootDirectory, "job.json"), job);
  return job;
}

export async function createVideoJob(params: {
  id: string;
  prompt: string;
  assetsDirectory: string;
}) {
  return writeJob(buildBaseJob(params));
}

export async function updateVideoJob(
  jobId: string,
  updates: Partial<Omit<VideoJobResult, "id" | "createdAt" | "assetsDirectory">> & {
    status?: VideoJobStatus;
  }
) {
  const currentJob = await readVideoJob(jobId);

  return writeJob({
    ...currentJob,
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

export async function markVideoJobFailed(jobId: string, error: string) {
  return updateVideoJob(jobId, {
    status: "failed",
    error
  });
}
