import type {
  GeneratedScript,
  GeneratedVideoMetadata,
  SubtitleSegment,
  VideoPlan,
  VideoScene
} from "@/lib/types";
import {
  generateScript as generateRealScript,
  generateVideoMetadata as generateRealVideoMetadata,
  generateVideoPlan as generateRealVideoPlan
} from "@/lib/providers/openai";
import { generateNarrationAudio as generateRealNarrationAudio } from "@/lib/providers/openai-tts";
import { transcribeNarration as transcribeRealNarration } from "@/lib/providers/openai-transcription";
import { generateSceneClip as generateRealSceneClip } from "@/lib/providers/replicate";
import {
  generateMockNarrationAudio,
  generateMockVideoMetadata,
  generateMockScript,
  generateMockVideoPlan,
  transcribeMockNarration
} from "@/lib/providers/mock/openai";
import { generateMockSceneClip } from "@/lib/providers/mock/replicate";

type GenerateClipParams = {
  prompt: string;
  durationSeconds: number;
  outputPath: string;
  maxRetries?: number;
};

let providerModeOverride: "real" | "mock" | null = null;

function shouldUseMockProviders() {
  if (providerModeOverride) {
    return providerModeOverride === "mock";
  }

  return process.env.USE_MOCK_PROVIDERS === "true";
}

export function setProviderModeForTests(mode: "real" | "mock" | null) {
  providerModeOverride = mode;
}

export async function generateScript(prompt: string): Promise<GeneratedScript> {
  return shouldUseMockProviders()
    ? generateMockScript(prompt)
    : generateRealScript(prompt);
}

export async function generateVideoPlan(
  prompt: string,
  script: GeneratedScript
): Promise<VideoPlan> {
  return shouldUseMockProviders()
    ? generateMockVideoPlan(prompt, script)
    : generateRealVideoPlan(prompt, script);
}

export async function generateVideoMetadata(params: {
  prompt: string;
  script: string;
  scenes: VideoScene[];
}): Promise<GeneratedVideoMetadata> {
  return shouldUseMockProviders()
    ? generateMockVideoMetadata(params.prompt)
    : generateRealVideoMetadata(params);
}

export async function generateNarrationAudio(
  narration: string
): Promise<ArrayBuffer> {
  return shouldUseMockProviders()
    ? generateMockNarrationAudio(narration)
    : generateRealNarrationAudio(narration);
}

export async function transcribeNarration(audioPath: string): Promise<SubtitleSegment[]> {
  return shouldUseMockProviders()
    ? transcribeMockNarration(audioPath)
    : transcribeRealNarration(audioPath);
}

export async function generateSceneClip(params: GenerateClipParams) {
  return shouldUseMockProviders()
    ? generateMockSceneClip(params)
    : generateRealSceneClip(params);
}
