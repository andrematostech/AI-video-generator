import path from "node:path";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { getServerEnv } from "@/lib/config/env.server";
import { ensureDirectories } from "@/lib/server/filesystem";

export type VideoQueueItem = {
  jobId: string;
  prompt: string;
  attempt: number;
  maxAttempts: number;
  enqueuedAt: string;
};

type ClaimedQueueItem = {
  item: VideoQueueItem;
  processingPath: string;
};

function buildQueueDirectories() {
  const env = getServerEnv();
  const rootDirectory = path.join(env.ASSETS_DIR, ".queue");

  return {
    rootDirectory,
    pendingDirectory: path.join(rootDirectory, "pending"),
    processingDirectory: path.join(rootDirectory, "processing"),
    failedDirectory: path.join(rootDirectory, "failed")
  };
}

export async function ensureQueueDirectories() {
  const directories = buildQueueDirectories();
  await ensureDirectories([
    directories.rootDirectory,
    directories.pendingDirectory,
    directories.processingDirectory,
    directories.failedDirectory
  ]);

  return directories;
}

function buildQueueFileName(item: VideoQueueItem) {
  return `${Date.now()}-${item.jobId}-attempt-${item.attempt}.json`;
}

export async function enqueueVideoJob(item: VideoQueueItem) {
  const directories = await ensureQueueDirectories();
  const filePath = path.join(
    directories.pendingDirectory,
    buildQueueFileName(item)
  );

  await writeFile(filePath, JSON.stringify(item, null, 2), "utf8");
}

export async function claimNextVideoJob(): Promise<ClaimedQueueItem | null> {
  const directories = await ensureQueueDirectories();
  const entries = (await readdir(directories.pendingDirectory))
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  for (const entry of entries) {
    const pendingPath = path.join(directories.pendingDirectory, entry);
    const processingPath = path.join(directories.processingDirectory, entry);

    try {
      await rename(pendingPath, processingPath);
      const rawItem = await readFile(processingPath, "utf8");

      return {
        item: JSON.parse(rawItem) as VideoQueueItem,
        processingPath
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function completeClaimedVideoJob(processingPath: string) {
  await unlink(processingPath);
}

export async function retryClaimedVideoJob(
  item: VideoQueueItem,
  processingPath: string
) {
  await unlink(processingPath);
  await enqueueVideoJob({
    ...item,
    attempt: item.attempt + 1,
    enqueuedAt: new Date().toISOString()
  });
}

export async function moveClaimedVideoJobToFailed(
  item: VideoQueueItem,
  processingPath: string,
  error: string
) {
  const directories = await ensureQueueDirectories();
  const failedPath = path.join(
    directories.failedDirectory,
    buildQueueFileName(item)
  );

  await writeFile(
    failedPath,
    JSON.stringify(
      {
        ...item,
        failedAt: new Date().toISOString(),
        error
      },
      null,
      2
    ),
    "utf8"
  );

  await unlink(processingPath);
}
