import { writeFile } from "node:fs/promises";

type GenerateClipParams = {
  prompt: string;
  durationSeconds: number;
  outputPath: string;
  maxRetries?: number;
};

export async function generateMockSceneClip({
  prompt,
  durationSeconds,
  outputPath
}: GenerateClipParams) {
  await writeFile(
    outputPath,
    `MOCK_VIDEO:${prompt}\nDURATION:${durationSeconds}`,
    "utf8"
  );

  return {
    outputPath,
    sourceUrl: `mock://video/${encodeURIComponent(prompt)}`
  };
}
