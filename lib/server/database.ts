import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getServerEnv } from "@/lib/config/env.server";
import { GeneratedAsset, PipelineStepLog, VideoJobResult, VideoJobStatus } from "@/lib/types";

type StoredJob = {
  id: string;
  prompt: string;
  status: VideoJobStatus;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  title: string;
  script: string;
  targetDurationSeconds: number;
  progress: VideoJobResult["progress"];
  narrationAudioPath?: string;
  subtitlePath?: string;
  outputVideoPath: string;
  assetsDirectory: string;
  videoMetadata?: VideoJobResult["videoMetadata"];
  performanceMetrics?: VideoJobResult["performanceMetrics"];
};

type StoredScene = {
  jobId: string;
  sceneIndex: number;
  narration: string;
  videoPrompt: string;
  durationSeconds: number;
  clipPath?: string;
  createdAt: string;
  updatedAt: string;
};

type StoredGeneratedAsset = {
  id: number;
  jobId: string;
  sceneIndex?: number;
  assetType: GeneratedAsset["assetType"];
  filePath: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type StoredPipelineStepLog = {
  id: number;
  jobId: string;
  stepName: PipelineStepLog["stepName"];
  status: PipelineStepLog["status"];
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type StoredRateLimitEvent = {
  id: number;
  limiterKey: string;
  createdAtMs: number;
};

export type DatabaseStore = {
  jobs: StoredJob[];
  scenes: StoredScene[];
  generatedAssets: StoredGeneratedAsset[];
  pipelineStepLogs: StoredPipelineStepLog[];
  rateLimitEvents: StoredRateLimitEvent[];
  counters: {
    generatedAssetId: number;
    pipelineStepLogId: number;
    rateLimitEventId: number;
  };
};

const EMPTY_STORE: DatabaseStore = {
  jobs: [],
  scenes: [],
  generatedAssets: [],
  pipelineStepLogs: [],
  rateLimitEvents: [],
  counters: {
    generatedAssetId: 0,
    pipelineStepLogId: 0,
    rateLimitEventId: 0
  }
};

let writeChain = Promise.resolve();

function getStoreFilePath() {
  const env = getServerEnv();
  return path.join(env.ASSETS_DIR, ".data", "video-generator-store.json");
}

async function cloneStore(store: DatabaseStore) {
  return JSON.parse(JSON.stringify(store)) as DatabaseStore;
}

async function loadStore() {
  const filePath = getStoreFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DatabaseStore>;

    return {
      ...EMPTY_STORE,
      ...parsed,
      jobs: parsed.jobs ?? [],
      scenes: parsed.scenes ?? [],
      generatedAssets: parsed.generatedAssets ?? [],
      pipelineStepLogs: parsed.pipelineStepLogs ?? [],
      rateLimitEvents: parsed.rateLimitEvents ?? [],
      counters: {
        ...EMPTY_STORE.counters,
        ...(parsed.counters ?? {})
      }
    };
  } catch {
    await writeFile(filePath, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
    return cloneStore(EMPTY_STORE);
  }
}

async function persistStore(store: DatabaseStore) {
  const filePath = getStoreFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export async function runDatabaseWrite<T>(
  callback: (store: DatabaseStore) => T | Promise<T>
) {
  const pendingResult = writeChain.then(async () => {
    const currentStore = await loadStore();
    const mutableStore = await cloneStore(currentStore);
    const result = await callback(mutableStore);
    await persistStore(mutableStore);
    return result;
  });

  writeChain = pendingResult.then(
    () => undefined,
    () => undefined
  );

  return pendingResult;
}

export async function runDatabaseRead<T>(
  callback: (store: DatabaseStore) => T | Promise<T>
) {
  const store = await loadStore();
  const readonlyStore = await cloneStore(store);
  return callback(readonlyStore);
}

export async function resetDatabaseForTests() {
  writeChain = Promise.resolve();
}
