import {
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
