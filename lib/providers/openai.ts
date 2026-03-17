import OpenAI from "openai";
import { getServerEnv } from "@/lib/config/env.server";
import { runWithAbortTimeout } from "@/lib/providers/provider-timeout";
import {
  GeneratedScript,
  GeneratedVideoMetadata,
  VideoPlan,
  VideoScene
} from "@/lib/types";

type ScenePlanResponse = {
  scenes: unknown;
};

type VideoMetadataResponse = {
  title: unknown;
  shortDescription: unknown;
  tags: unknown;
};

const OPENAI_RESPONSE_TIMEOUT_MS = 60_000;

function getOpenAiClient() {
  const env = getServerEnv();

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });
}

function extractTextFromResponse(response: OpenAI.Responses.Response) {
  const chunks: string[] = [];

  for (const output of response.output) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content) {
      if (content.type === "output_text") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export function parseGeneratedScript(input: unknown): GeneratedScript {
  const parsed = input as Partial<GeneratedScript>;

  if (!parsed.title || !parsed.narrationScript) {
    throw new Error("OpenAI returned an invalid script response.");
  }

  return {
    title: String(parsed.title),
    narrationScript: String(parsed.narrationScript),
    targetDurationSeconds: Number(parsed.targetDurationSeconds ?? 20)
  };
}

export function parseGeneratedVideoMetadata(input: unknown): GeneratedVideoMetadata {
  const parsed = input as Partial<VideoMetadataResponse>;

  if (
    typeof parsed.title !== "string" ||
    parsed.title.trim().length === 0 ||
    typeof parsed.shortDescription !== "string" ||
    parsed.shortDescription.trim().length === 0 ||
    !Array.isArray(parsed.tags)
  ) {
    throw new Error("OpenAI returned invalid video metadata.");
  }

  const tags = parsed.tags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  if (tags.length === 0) {
    throw new Error("OpenAI returned invalid video metadata.");
  }

  return {
    title: parsed.title.trim(),
    shortDescription: parsed.shortDescription.trim(),
    tags
  };
}

export async function generateScript(prompt: string): Promise<GeneratedScript> {
  const env = getServerEnv();
  const response = await runWithAbortTimeout(
    "OpenAI script generation",
    OPENAI_RESPONSE_TIMEOUT_MS,
    (signal) =>
      getOpenAiClient().responses.create(
        {
          model: env.OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "You create short AI video scripts. Return strict JSON with keys title, narrationScript, targetDurationSeconds. Keep it concise, cinematic, and suitable for a 15 to 30 second video."
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_object"
            }
          }
        },
        { signal }
      )
  );

  const rawJson = extractTextFromResponse(response);
  return parseGeneratedScript(JSON.parse(rawJson));
}

export async function generateVideoPlan(
  prompt: string,
  script: GeneratedScript
): Promise<VideoPlan> {
  const env = getServerEnv();
  const response = await runWithAbortTimeout(
    "OpenAI scene planning",
    OPENAI_RESPONSE_TIMEOUT_MS,
    (signal) =>
      getOpenAiClient().responses.create(
        {
          model: env.OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "You are planning scenes for a short AI-generated video. Return strict JSON with one key: scenes. scenes must contain between 4 and 6 items. Each scene must contain exactly sceneIndex, narration, videoPrompt, durationSeconds. Match the provided script and keep the total duration close to the provided target duration."
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    prompt,
                    title: script.title,
                    narrationScript: script.narrationScript,
                    targetDurationSeconds: script.targetDurationSeconds
                  })
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "scene_plan",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["scenes"],
                properties: {
                  scenes: {
                    type: "array",
                    minItems: 4,
                    maxItems: 6,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "sceneIndex",
                        "narration",
                        "videoPrompt",
                        "durationSeconds"
                      ],
                      properties: {
                        sceneIndex: {
                          type: "integer",
                          minimum: 1
                        },
                        narration: {
                          type: "string"
                        },
                        videoPrompt: {
                          type: "string"
                        },
                        durationSeconds: {
                          type: "number",
                          minimum: 1,
                          maximum: 30
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        { signal }
      )
  );

  const rawJson = extractTextFromResponse(response);
  const parsed = JSON.parse(rawJson) as ScenePlanResponse;
  const scenes = parseScenePlan(parsed.scenes);

  return {
    title: script.title,
    script: script.narrationScript,
    targetDurationSeconds: script.targetDurationSeconds,
    scenes
  };
}

export async function generateVideoMetadata(params: {
  prompt: string;
  script: string;
  scenes: VideoScene[];
}): Promise<GeneratedVideoMetadata> {
  const env = getServerEnv();
  const response = await runWithAbortTimeout(
    "OpenAI metadata generation",
    OPENAI_RESPONSE_TIMEOUT_MS,
    (signal) =>
      getOpenAiClient().responses.create(
        {
          model: env.OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "You create publish-ready metadata for short AI videos. Return strict JSON with title, shortDescription, and tags. Keep the title concise, write a one or two sentence description, and produce 3 to 6 short lowercase tags."
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    prompt: params.prompt,
                    script: params.script,
                    scenes: params.scenes.map((scene) => ({
                      sceneIndex: scene.sceneIndex,
                      narration: scene.narration,
                      videoPrompt: scene.videoPrompt,
                      durationSeconds: scene.durationSeconds
                    }))
                  })
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "video_metadata",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["title", "shortDescription", "tags"],
                properties: {
                  title: {
                    type: "string",
                    minLength: 1
                  },
                  shortDescription: {
                    type: "string",
                    minLength: 1
                  },
                  tags: {
                    type: "array",
                    minItems: 3,
                    maxItems: 6,
                    items: {
                      type: "string",
                      minLength: 1
                    }
                  }
                }
              }
            }
          }
        },
        { signal }
      )
  );

  const rawJson = extractTextFromResponse(response);
  return parseGeneratedVideoMetadata(JSON.parse(rawJson));
}

export function parseScenePlan(input: unknown): VideoScene[] {
  if (!Array.isArray(input) || input.length < 4 || input.length > 6) {
    throw new Error("OpenAI returned an invalid scene list.");
  }

  return input.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error(`OpenAI returned an invalid scene at index ${index}.`);
    }

    const candidate = scene as Record<string, unknown>;
    const narration = String(candidate.narration ?? "").trim();
    const videoPrompt = String(candidate.videoPrompt ?? "").trim();
    const durationSeconds = Number(candidate.durationSeconds);

    if (!narration || !videoPrompt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`OpenAI returned an invalid scene at index ${index}.`);
    }

    return {
      // Re-number scenes defensively so minor model formatting issues do not break the pipeline.
      sceneIndex: index + 1,
      narration,
      videoPrompt,
      durationSeconds,
      clipPath: undefined
    };
  });
}
