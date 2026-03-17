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

type QueueLocation = "pending" | "processing";

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

async function readQueueItemsFromDirectory(
  directoryPath: string,
  location: QueueLocation
) {
  const entries = (await readdir(directoryPath))
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  const items: Array<{
    item: VideoQueueItem;
    filePath: string;
    fileName: string;
    location: QueueLocation;
  }> = [];

  for (const entry of entries) {
    const filePath = path.join(directoryPath, entry);

    try {
      const rawItem = await readFile(filePath, "utf8");
      items.push({
        item: JSON.parse(rawItem) as VideoQueueItem,
        filePath,
        fileName: entry,
        location
      });
    } catch {
      continue;
    }
  }

  return items;
}

export async function listQueueItems() {
  const directories = await ensureQueueDirectories();
  const [pendingItems, processingItems] = await Promise.all([
    readQueueItemsFromDirectory(directories.pendingDirectory, "pending"),
    readQueueItemsFromDirectory(directories.processingDirectory, "processing")
  ]);

  return [...pendingItems, ...processingItems];
}

export async function recoverProcessingQueueItems() {
  const directories = await ensureQueueDirectories();
  const processingItems = await readQueueItemsFromDirectory(
    directories.processingDirectory,
    "processing"
  );

  let recoveredCount = 0;

  for (const processingItem of processingItems) {
    const pendingPath = path.join(
      directories.pendingDirectory,
      processingItem.fileName
    );

    try {
      await rename(processingItem.filePath, pendingPath);
      recoveredCount += 1;
    } catch {
      await unlink(processingItem.filePath).catch(() => undefined);
    }
  }

  return recoveredCount;
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

export async function removePendingVideoJobs(jobId: string) {
  const directories = await ensureQueueDirectories();
  const entries = (await readdir(directories.pendingDirectory))
    .filter((entry) => entry.endsWith(".json") && entry.includes(`-${jobId}-attempt-`));

  await Promise.all(
    entries.map((entry) =>
      unlink(path.join(directories.pendingDirectory, entry)).catch(() => undefined)
    )
  );
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
