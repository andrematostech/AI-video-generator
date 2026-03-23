import Replicate from "replicate";
import { createReadStream } from "node:fs";
import { getServerEnv } from "@/lib/config/env.server";
import { downloadFile } from "@/lib/server/filesystem";

type ReplicateModelIdentifier = `${string}/${string}` | `${string}/${string}:${string}`;

type GenerateClipParams = {
  prompt: string;
  durationSeconds: number;
  outputPath: string;
  negativePrompt?: string;
  cfgScale?: number;
  startImagePath?: string;
  maxRetries?: number;
  shouldCancel?: () => Promise<boolean>;
};

type GenerateClipResult = {
  outputPath: string;
  sourceUrl: string;
  durationSeconds: number;
};

type ReplicatePrediction = Awaited<ReturnType<ReturnType<typeof getReplicateClient>["predictions"]["create"]>>;

const REPLICATE_PREDICTION_TIMEOUT_MS = 15 * 60_000;
const REPLICATE_POLL_INTERVAL_MS = 3_000;
const SUPPORTED_REPLICATE_DURATIONS = [5, 10] as const;

function getReplicateClient() {
  const env = getServerEnv();

  return new Replicate({
    auth: env.REPLICATE_API_TOKEN
  });
}

function extractOutputUrl(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const first = output.find((item) => typeof item === "string");
    if (first) {
      return first;
    }
  }

  throw new Error("Replicate did not return a downloadable output URL.");
}

async function requestSceneClipUrl(
  prompt: string,
  durationSeconds: number,
  negativePrompt?: string,
  cfgScale?: number,
  startImagePath?: string,
  shouldCancel?: () => Promise<boolean>
) {
  const env = getServerEnv();
  const normalizedDurationSeconds = normalizeReplicateDurationSeconds(durationSeconds);
  const client = getReplicateClient();
  const prediction = await client.predictions.create({
    model: env.REPLICATE_MODEL as ReplicateModelIdentifier,
    input: {
      prompt,
      duration: normalizedDurationSeconds,
      aspect_ratio: "16:9",
      cfg_scale: typeof cfgScale === "number" ? cfgScale : 0.5,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(startImagePath ? { start_image: createReadStream(startImagePath) } : {})
    }
  });

  const completedPrediction = await waitForPredictionCompletion(client, prediction.id, shouldCancel);

  if (completedPrediction.status !== "succeeded") {
    throw new Error(
      completedPrediction.error
        ? `Replicate prediction failed: ${completedPrediction.error}`
        : `Replicate prediction ended with status "${completedPrediction.status}".`
    );
  }

  return {
    sourceUrl: extractOutputUrl(completedPrediction.output),
    durationSeconds: normalizedDurationSeconds
  };
}

export function normalizeReplicateDurationSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return SUPPORTED_REPLICATE_DURATIONS[0];
  }

  return durationSeconds <= 7 ? 5 : 10;
}

export function extractReplicateRetryAfterSeconds(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const retryAfterMatch = error.message.match(/"retry_after":\s*(\d+)/i);
  if (retryAfterMatch) {
    return Number(retryAfterMatch[1]);
  }

  const resetMatch = error.message.match(/resets in ~(\d+)s/i);
  if (resetMatch) {
    return Number(resetMatch[1]);
  }

  return null;
}

function isPredictionTerminal(status: string) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

async function waitForPredictionCompletion(
  client: ReturnType<typeof getReplicateClient>,
  predictionId: string,
  shouldCancel?: () => Promise<boolean>
) {
  const deadline = Date.now() + REPLICATE_PREDICTION_TIMEOUT_MS;
  let prediction = await client.predictions.get(predictionId);

  while (!isPredictionTerminal(prediction.status)) {
    if (shouldCancel && (await shouldCancel())) {
      await client.predictions.cancel(predictionId).catch(() => undefined);
      throw new Error("Job was cancelled by user.");
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Replicate clip generation timed out after ${REPLICATE_PREDICTION_TIMEOUT_MS}ms while polling prediction ${predictionId}.`
      );
    }

    await delay(REPLICATE_POLL_INTERVAL_MS);

    try {
      prediction = await client.predictions.get(predictionId);
    } catch (error) {
      const retryAfterSeconds = extractReplicateRetryAfterSeconds(error);

      if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
        await delay(retryAfterSeconds * 1000);
        prediction = await client.predictions.get(predictionId);
        continue;
      }

      throw error;
    }
  }

  return prediction;
}

function delay(timeoutMs: number) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

async function retry<T>(operation: () => Promise<T>, maxRetries: number): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt > maxRetries) {
        break;
      }

      const retryAfterSeconds = extractReplicateRetryAfterSeconds(error);
      const delayMs =
        typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : attempt * 1000;

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Replicate clip generation failed.");
}

export async function generateSceneClip({
  prompt,
  durationSeconds,
  outputPath,
  negativePrompt,
  cfgScale,
  startImagePath,
  maxRetries = 2,
  shouldCancel
}: GenerateClipParams): Promise<GenerateClipResult> {
  const clipUrl = await retry(
    () =>
      requestSceneClipUrl(
        prompt,
        durationSeconds,
        negativePrompt,
        cfgScale,
        startImagePath,
        shouldCancel
      ),
    maxRetries
  );

  await downloadFile(clipUrl.sourceUrl, outputPath);

  return {
    outputPath,
    sourceUrl: clipUrl.sourceUrl,
    durationSeconds: clipUrl.durationSeconds
  };
}
