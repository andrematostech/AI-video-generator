import OpenAI from "openai";
import { getServerEnv } from "@/lib/config/env.server";
import { runWithAbortTimeout } from "@/lib/providers/provider-timeout";
import {
  GeneratedScript,
  GeneratedVideoMetadata,
  VideoPlan,
  VideoScene,
  VideoStyleMode
} from "@/lib/types";

type ScenePlanResponse = {
  scenes: unknown;
};

type VideoMetadataResponse = {
  title: unknown;
  shortDescription: unknown;
  tags: unknown;
};

type SceneCountPlan = {
  target: number;
  min: number;
  max: number;
};

type SceneQualityProfile = {
  requestedStylizedLook: boolean;
  styleMode: VideoStyleMode;
  continuityBrief: string;
  styleDirective: string;
  consistencyAnchors: string[];
  cinematicDirectives: string[];
};

const OPENAI_RESPONSE_TIMEOUT_MS = 60_000;
const STYLIZED_KEYWORDS = [
  "anime",
  "animated",
  "animation",
  "cartoon",
  "illustration",
  "illustrated",
  "comic",
  "manga",
  "pixar",
  "stylized",
  "stylised",
  "3d render",
  "cgi",
  "game art"
] as const;

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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractConsistencyAnchors(prompt: string) {
  const normalizedPrompt = normalizeWhitespace(prompt);
  const anchorPatterns = [
    /\b(?:real human actor|male actor|female actor|young woman|young man|lone figure|lone hacker|traveler|traveller|scientist|founder|designer|dog|golden retriever|woman|man)\b/gi,
    /\b(?:trench coat|hoodie|suit|jacket|armor|armour|implants|augmented implants|backpack)\b/gi,
    /\b(?:cyberpunk city|neon-lit city|rain-soaked city street|mountain lake|forest at sunrise|wet reflective streets|holographic ads|flying vehicles)\b/gi,
    /\b(?:35mm|50mm|shallow depth of field|wide aerial shot|street-level shot|close-up|tracking shot|slow motion|slow cinematic movement)\b/gi,
    /\b(?:neon blue|electric purple|hot pink|cyan glow|deep blacks|volumetric fog|wet reflective surfaces|film-grade color grading|photorealistic|live-action)\b/gi
  ];

  const anchors = new Set<string>();

  for (const pattern of anchorPatterns) {
    const matches = normalizedPrompt.match(pattern) ?? [];

    for (const match of matches) {
      const anchor = normalizeWhitespace(match.toLowerCase());

      if (anchor.length >= 3) {
        anchors.add(anchor);
      }
    }
  }

  return [...anchors].slice(0, 8);
}

function buildCinematicDirectives(styleMode: VideoStyleMode) {
  if (styleMode === "stylized") {
    return [
      "frame each shot like a premium concept trailer image",
      "clear focal subject and readable silhouette",
      "deliberate environmental storytelling",
      "cohesive color contrast and controlled motion",
      "avoid flat generic stock-video composition"
    ];
  }

  return [
    "frame each shot like a high-budget feature film",
    "strong subject separation and readable composition",
    "practical motivated lighting with cinematic contrast",
    "premium lens language with stable perspective",
    "performance-driven subject focus instead of generic montage",
    "avoid cheap stock-video framing and toy-like CGI aesthetics"
  ];
}

function getSceneCountPlan(targetDurationSeconds: number): SceneCountPlan {
  if (targetDurationSeconds <= 12) {
    return { target: 2, min: 2, max: 3 };
  }

  if (targetDurationSeconds <= 18) {
    return { target: 3, min: 3, max: 4 };
  }

  if (targetDurationSeconds <= 24) {
    return { target: 4, min: 4, max: 5 };
  }

  return { target: 5, min: 5, max: 6 };
}

function promptRequestsStylizedLook(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();
  return STYLIZED_KEYWORDS.some((keyword) => {
    if (!normalizedPrompt.includes(keyword)) {
      return false;
    }

    const negativePattern = new RegExp(
      `(avoid|no|not|without)\\s+[^.\\n]{0,24}${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i"
    );

    return !negativePattern.test(normalizedPrompt);
  });
}

function buildSceneQualityProfile(
  prompt: string,
  styleMode: VideoStyleMode = "realistic"
): SceneQualityProfile {
  const requestedStylizedLook = promptRequestsStylizedLook(prompt);
  const shouldUseStylizedLook = styleMode === "stylized";

  return {
    requestedStylizedLook,
    styleMode,
    continuityBrief:
      "Maintain the same hero subject identity, wardrobe silhouette, age range, environment design language, lens feel, lighting direction, color grade, and atmospheric density across all scenes unless the prompt explicitly calls for a change.",
    styleDirective: shouldUseStylizedLook
      ? "Preserve a highly designed stylized cinematic look with deliberate shape language, consistent character design, premium atmospheric detail, and stable color treatment across every scene."
      : "Default to a live-action photorealistic cinematic look with realistic human anatomy, natural skin texture, film-like lighting, stable lens language, and avoid anime, cartoon, illustration, glossy game-art, or synthetic CGI character aesthetics.",
    consistencyAnchors: extractConsistencyAnchors(prompt),
    cinematicDirectives: buildCinematicDirectives(styleMode)
  };
}

function buildScenePlanningGuidance(
  prompt: string,
  targetDurationSeconds: number,
  styleMode: VideoStyleMode = "realistic"
) {
  const sceneCountPlan = getSceneCountPlan(targetDurationSeconds);
  const qualityProfile = buildSceneQualityProfile(prompt, styleMode);

  return [
    `Target scene count: ${sceneCountPlan.target}.`,
    `Allowed scene count range: ${sceneCountPlan.min} to ${sceneCountPlan.max}.`,
    "Preserve the user's important visual constraints instead of simplifying them away.",
    "Each videoPrompt must be rich and production-ready, with concrete subject detail, environment, camera framing, lens feel, lighting, mood, color palette, and motion.",
    qualityProfile.continuityBrief,
    qualityProfile.styleDirective,
    qualityProfile.consistencyAnchors.length > 0
      ? `Keep these continuity anchors visible across scenes: ${qualityProfile.consistencyAnchors.join(", ")}.`
      : "If the user describes a hero subject, wardrobe, environment, lens, or color palette, keep those details visibly consistent across scenes.",
    `Use this cinematic brief: ${qualityProfile.cinematicDirectives.join(", ")}.`,
    "Prefer iconic shots with clear cinematic intent over vague filler coverage.",
    "Make each scene prompt strong enough to send directly to a video generation model without needing extra style explanation."
  ].join(" ");
}

export function enhanceScenePrompt(
  videoPrompt: string,
  originalPrompt: string,
  styleMode: VideoStyleMode = "realistic"
) {
  const normalizedVideoPrompt = normalizeWhitespace(videoPrompt);
  const normalizedPrompt = normalizeWhitespace(originalPrompt);
  const qualityProfile = buildSceneQualityProfile(normalizedPrompt, styleMode);
  const sharedQualityDirectives =
    qualityProfile.styleMode === "stylized" || qualityProfile.requestedStylizedLook
      ? "high-end cinematic composition, consistent character design, stable wardrobe and silhouette continuity, consistent lighting direction, consistent color grade, smooth natural motion, premium atmospheric detail, cohesive stylized worldbuilding"
      : "live-action photorealistic, cinematic film look, realistic human anatomy and skin texture when people appear, natural motion, high-end production value, consistent character design, stable wardrobe and facial continuity, consistent lighting direction, consistent lens language, consistent film-grade color grading, avoid anime, cartoon, illustration, glossy game-art, and synthetic CGI character look";

  const originalPromptSnippet =
    normalizedPrompt.length > 260
      ? `${normalizedPrompt.slice(0, 257)}...`
      : normalizedPrompt;
  const continuityAnchorsSnippet =
    qualityProfile.consistencyAnchors.length > 0
      ? ` Keep these continuity anchors stable across scenes: ${qualityProfile.consistencyAnchors.join(", ")}.`
      : "";
  const cinematicBriefSnippet = ` Use this cinematic brief: ${qualityProfile.cinematicDirectives.join(", ")}.`;

  return normalizeWhitespace(
    `${normalizedVideoPrompt}. Preserve these core user directions: ${originalPromptSnippet}.${continuityAnchorsSnippet}${cinematicBriefSnippet} ${sharedQualityDirectives}.`
  );
}

export function enhanceScenePlan(scenes: VideoScene[], originalPrompt: string) {
  return enhanceScenePlanWithStyle(scenes, originalPrompt, "realistic");
}

export function enhanceScenePlanWithStyle(
  scenes: VideoScene[],
  originalPrompt: string,
  styleMode: VideoStyleMode = "realistic"
) {
  return scenes.map((scene) => ({
    ...scene,
    videoPrompt: enhanceScenePrompt(scene.videoPrompt, originalPrompt, styleMode)
  }));
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

export async function generateScript(
  prompt: string,
  styleMode: VideoStyleMode = "realistic"
): Promise<GeneratedScript> {
  const env = getServerEnv();
  const qualityProfile = buildSceneQualityProfile(prompt, styleMode);
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
                    `You create short AI video scripts. Return strict JSON with keys title, narrationScript, targetDurationSeconds. Keep it concise, cinematic, and suitable for a 15 to 30 second video. Preserve the user's intended realism, camera language, mood, and visual style instead of flattening them into generic marketing copy. ${qualityProfile.continuityBrief} ${qualityProfile.styleDirective} Use this cinematic brief: ${qualityProfile.cinematicDirectives.join(", ")}.`
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
  script: GeneratedScript,
  styleMode: VideoStyleMode = "realistic"
): Promise<VideoPlan> {
  const env = getServerEnv();
  const sceneCountPlan = getSceneCountPlan(script.targetDurationSeconds);
  const planningGuidance = buildScenePlanningGuidance(
    prompt,
    script.targetDurationSeconds,
    styleMode
  );
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
                    `You are planning scenes for a short AI-generated video. Return strict JSON with one key: scenes. Each scene must contain exactly sceneIndex, narration, videoPrompt, durationSeconds. Match the provided script and keep the total duration close to the provided target duration. ${planningGuidance}`
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
                    minItems: sceneCountPlan.min,
                    maxItems: sceneCountPlan.max,
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
  const scenes = enhanceScenePlanWithStyle(
    parseScenePlan(parsed.scenes, sceneCountPlan),
    prompt,
    styleMode
  );

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

export function parseScenePlan(
  input: unknown,
  sceneCountPlan: Pick<SceneCountPlan, "min" | "max"> = { min: 2, max: 6 }
): VideoScene[] {
  if (
    !Array.isArray(input) ||
    input.length < sceneCountPlan.min ||
    input.length > sceneCountPlan.max
  ) {
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
