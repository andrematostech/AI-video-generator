import Replicate from "replicate";
import { getServerEnv } from "@/lib/config/env.server";
import { runWithTimeout } from "@/lib/providers/provider-timeout";
import { downloadFile } from "@/lib/server/filesystem";

type ReplicateModelIdentifier = `${string}/${string}` | `${string}/${string}:${string}`;

type GenerateClipParams = {
  prompt: string;
  durationSeconds: number;
  outputPath: string;
  maxRetries?: number;
};

const REPLICATE_GENERATION_TIMEOUT_MS = 180_000;

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

async function requestSceneClipUrl(prompt: string, durationSeconds: number) {
  const env = getServerEnv();
  const output = await runWithTimeout(
    "Replicate clip generation",
    REPLICATE_GENERATION_TIMEOUT_MS,
    () =>
      getReplicateClient().run(
        env.REPLICATE_MODEL as ReplicateModelIdentifier,
        {
          input: {
            prompt,
            duration: durationSeconds,
            aspect_ratio: "16:9"
          }
        }
      )
  );

  return extractOutputUrl(output);
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

      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Replicate clip generation failed.");
}

export async function generateSceneClip({
  prompt,
  durationSeconds,
  outputPath,
  maxRetries = 2
}: GenerateClipParams) {
  const clipUrl = await retry(
    () => requestSceneClipUrl(prompt, durationSeconds),
    maxRetries
  );

  await downloadFile(clipUrl, outputPath);

  return {
    outputPath,
    sourceUrl: clipUrl
  };
}
