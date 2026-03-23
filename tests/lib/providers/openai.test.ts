import {
  enhanceScenePlan,
  enhanceScenePrompt,
  parseGeneratedScript,
  parseGeneratedVideoMetadata,
  parseScenePlan
} from "@/lib/providers/openai";

describe("OpenAI provider parsing", () => {
  it("parses a generated script payload with fallback duration", () => {
    const result = parseGeneratedScript({
      title: "Focus App Promo",
      narrationScript: "A short narration"
    });

    expect(result).toEqual({
      title: "Focus App Promo",
      narrationScript: "A short narration",
      targetDurationSeconds: 20
    });
  });

  it("throws when the generated script payload is invalid", () => {
    expect(() => parseGeneratedScript({ title: "Missing narration" })).toThrow(
      "OpenAI returned an invalid script response."
    );
  });

  it("parses and trims a valid scene plan", () => {
    const result = parseScenePlan([
      {
        sceneIndex: 1,
        narration: " Scene one narration ",
        videoPrompt: " Prompt one ",
        durationSeconds: 4
      },
      {
        sceneIndex: 2,
        narration: "Scene two narration",
        videoPrompt: "Prompt two",
        durationSeconds: 5
      },
      {
        sceneIndex: 3,
        narration: "Scene three narration",
        videoPrompt: "Prompt three",
        durationSeconds: 5
      },
      {
        sceneIndex: 4,
        narration: "Scene four narration",
        videoPrompt: "Prompt four",
        durationSeconds: 6
      }
    ]);

    expect(result[0]).toEqual({
      sceneIndex: 1,
      narration: "Scene one narration",
      videoPrompt: "Prompt one",
      durationSeconds: 4,
      clipPath: undefined
    });
    expect(result).toHaveLength(4);
  });

  it("normalizes scene indexes and numeric string durations", () => {
    const result = parseScenePlan([
      {
        sceneIndex: "10",
        narration: " Scene one narration ",
        videoPrompt: " Prompt one ",
        durationSeconds: "4"
      },
      {
        sceneIndex: 7,
        narration: "Scene two narration",
        videoPrompt: "Prompt two",
        durationSeconds: "5"
      },
      {
        sceneIndex: 3,
        narration: "Scene three narration",
        videoPrompt: "Prompt three",
        durationSeconds: 5
      },
      {
        sceneIndex: 99,
        narration: "Scene four narration",
        videoPrompt: "Prompt four",
        durationSeconds: "6"
      }
    ]);

    expect(result.map((scene) => scene.sceneIndex)).toEqual([1, 2, 3, 4]);
    expect(result.map((scene) => scene.durationSeconds)).toEqual([4, 5, 5, 6]);
  });

  it("throws when the scene plan count is out of range", () => {
    expect(() =>
      parseScenePlan([
        {
          sceneIndex: 1,
          narration: "Only one",
          videoPrompt: "Only one",
          durationSeconds: 4
        }
      ])
    ).toThrow("OpenAI returned an invalid scene list.");
  });

  it("supports shorter scene plans for shorter videos when allowed", () => {
    const result = parseScenePlan(
      [
        {
          sceneIndex: 1,
          narration: "Opening cinematic establishing shot.",
          videoPrompt: "Wide establishing shot of the city at night",
          durationSeconds: 5
        },
        {
          sceneIndex: 2,
          narration: "Hero subject is revealed in close-up.",
          videoPrompt: "Close-up on the main character under neon rain",
          durationSeconds: 5
        }
      ],
      { min: 2, max: 3 }
    );

    expect(result).toHaveLength(2);
  });

  it("enriches realistic scene prompts with preserved user style guidance", () => {
    const result = enhanceScenePrompt(
      "Wide shot of a neon city street at night with rain on the pavement",
      "Create a live-action photorealistic cyberpunk film with realistic human character, cinematic lighting, wet reflective streets, avoid anime and cartoon.",
      "realistic"
    );

    expect(result).toContain("Preserve these core user directions");
    expect(result).toContain("live-action photorealistic");
    expect(result).toContain("avoid anime, cartoon, illustration");
    expect(result).toContain("high-budget feature film");
  });

  it("enriches every scene prompt in a generated scene plan", () => {
    const result = enhanceScenePlan(
      [
        {
          sceneIndex: 1,
          narration: "A lone figure walks through the city.",
          videoPrompt: "Street-level shot of a futuristic city sidewalk at night",
          durationSeconds: 5
        },
        {
          sceneIndex: 2,
          narration: "Reflections shimmer under neon lights.",
          videoPrompt: "Close-up of wet pavement with glowing reflections",
          durationSeconds: 5
        },
        {
          sceneIndex: 3,
          narration: "The city towers overhead.",
          videoPrompt: "Upward angle on towering skyscrapers",
          durationSeconds: 5
        },
        {
          sceneIndex: 4,
          narration: "The character disappears into the fog.",
          videoPrompt: "Wide shot fading into mist and darkness",
          durationSeconds: 5
        }
      ],
      "Create a realistic cinematic cyberpunk film sequence with live-action photorealism."
    );

    expect(result).toHaveLength(4);
    expect(result.every((scene) => scene.videoPrompt.includes("Preserve these core user directions"))).toBe(true);
  });

  it("uses the explicit stylized mode to keep a designed visual language", () => {
    const result = enhanceScenePrompt(
      "Medium shot of a neon-lit vigilante in a rainy alley",
      "Create a gritty cyberpunk city story with bold atmosphere.",
      "stylized"
    );

    expect(result).toContain("consistent character design");
    expect(result).toContain("cohesive stylized worldbuilding");
    expect(result).not.toContain("avoid anime, cartoon, illustration");
    expect(result).toContain("premium concept trailer image");
  });

  it("uses the explicit realistic mode to keep photorealistic guidance", () => {
    const result = enhanceScenePrompt(
      "Close-up of a hacker under neon signs",
      "Create a neon cyberpunk video with strong atmosphere.",
      "realistic"
    );

    expect(result).toContain("live-action photorealistic");
    expect(result).toContain("avoid anime, cartoon, illustration");
  });

  it("preserves extracted continuity anchors across realistic scene prompts", () => {
    const result = enhanceScenePrompt(
      "Street-level shot of a futuristic city sidewalk at night",
      "Create a live-action photorealistic cyberpunk film with a lone hacker in a trench coat, wet reflective streets, neon blue and electric purple lighting, and slow cinematic movement.",
      "realistic"
    );

    expect(result).toContain("Keep these continuity anchors stable across scenes");
    expect(result).toContain("lone hacker");
    expect(result).toContain("trench coat");
    expect(result).toContain("wet reflective streets");
    expect(result).toContain("neon blue");
  });

  it("adds a stronger cinematic brief for realistic film-like output", () => {
    const result = enhanceScenePrompt(
      "Medium shot of the protagonist in a rain-soaked alley",
      "Create a photorealistic cyberpunk thriller with practical lighting and a lone hacker.",
      "realistic"
    );

    expect(result).toContain("practical motivated lighting");
    expect(result).toContain("performance-driven subject focus");
    expect(result).toContain("avoid cheap stock-video framing");
  });

  it("parses generated video metadata", () => {
    const result = parseGeneratedVideoMetadata({
      title: "Focus App Demo",
      shortDescription: "A short product video for busy professionals.",
      tags: [" Product Demo ", "AI Video", "productivity"]
    });

    expect(result).toEqual({
      title: "Focus App Demo",
      shortDescription: "A short product video for busy professionals.",
      tags: ["product demo", "ai video", "productivity"]
    });
  });

  it("throws when generated video metadata is invalid", () => {
    expect(() =>
      parseGeneratedVideoMetadata({
        title: "",
        shortDescription: "Missing tags",
        tags: []
      })
    ).toThrow("OpenAI returned invalid video metadata.");
  });
});
