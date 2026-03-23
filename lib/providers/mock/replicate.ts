import { writeFile } from "node:fs/promises";

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

export async function generateMockSceneClip({
  prompt,
  durationSeconds,
  outputPath,
  negativePrompt,
  cfgScale,
  startImagePath
}: GenerateClipParams) {
  await writeFile(
    outputPath,
    `MOCK_VIDEO:${prompt}\nDURATION:${durationSeconds}\nNEGATIVE:${negativePrompt ?? ""}\nCFG:${cfgScale ?? 0.5}\nSTART_IMAGE:${startImagePath ?? ""}`,
    "utf8"
  );

  return {
    outputPath,
    sourceUrl: `mock://video/${encodeURIComponent(prompt)}`,
    durationSeconds
  };
}
