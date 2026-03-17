import { readFile } from "node:fs/promises";
import { TextEncoder } from "node:util";
import {
  GeneratedScript,
  GeneratedVideoMetadata,
  SubtitleSegment,
  VideoPlan,
  VideoScene
} from "@/lib/types";

function buildMockScenes(): VideoScene[] {
  return [
    {
      sceneIndex: 1,
      narration: "Meet the product in a bright, modern workspace.",
      videoPrompt: "Wide shot of a modern desk setup with a polished product reveal.",
      durationSeconds: 5
    },
    {
      sceneIndex: 2,
      narration: "Show the main workflow in a fast, satisfying motion sequence.",
      videoPrompt: "Medium shots of hands using the product with smooth camera movement.",
      durationSeconds: 5
    },
    {
      sceneIndex: 3,
      narration: "Highlight the key benefit with clear visual contrast.",
      videoPrompt: "Split-screen comparison emphasizing the product advantage.",
      durationSeconds: 5
    },
    {
      sceneIndex: 4,
      narration: "End with a confident brand moment and call to action.",
      videoPrompt: "Hero closing shot with logo, warm light, and subtle motion.",
      durationSeconds: 5
    }
  ];
}

export async function generateMockScript(prompt: string): Promise<GeneratedScript> {
  const normalizedPrompt = prompt.trim() || "Mock video";

  return {
    title: `Mock Video: ${normalizedPrompt.slice(0, 40)}`,
    narrationScript: [
      "Meet the product in a bright, modern workspace.",
      "Show the main workflow in a fast, satisfying motion sequence.",
      "Highlight the key benefit with clear visual contrast.",
      "End with a confident brand moment and call to action."
    ].join(" "),
    targetDurationSeconds: 20
  };
}

export async function generateMockVideoPlan(
  _prompt: string,
  script: GeneratedScript
): Promise<VideoPlan> {
  return {
    title: script.title,
    script: script.narrationScript,
    targetDurationSeconds: script.targetDurationSeconds,
    scenes: buildMockScenes()
  };
}

export async function generateMockNarrationAudio(
  narration: string
): Promise<ArrayBuffer> {
  return new TextEncoder().encode(`MOCK_AUDIO:${narration}`).buffer;
}

export async function transcribeMockNarration(audioPath: string): Promise<SubtitleSegment[]> {
  const raw = await readFile(audioPath, "utf8");
  const sourceText = raw.replace(/^MOCK_AUDIO:/, "").trim();
  const chunks = sourceText
    .split(".")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk, index) => ({
    startSeconds: index * 5,
    endSeconds: index * 5 + 5,
    text: `${chunk}.`
  }));
}

export async function generateMockVideoMetadata(prompt: string): Promise<GeneratedVideoMetadata> {
  const normalizedPrompt = prompt.trim() || "mock video";

  return {
    title: `Mock Video: ${normalizedPrompt.slice(0, 40)}`,
    shortDescription:
      "A mock-generated demo video showcasing a clear narrative, simple pacing, and structured scene flow.",
    tags: ["demo", "mock", "ai-video", "storytelling"]
  };
}
