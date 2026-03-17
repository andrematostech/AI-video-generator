import { loadServerEnv } from "@/lib/config/env";

describe("loadServerEnv", () => {
  it("loads required environment variables with defaults", () => {
    const env = loadServerEnv({
      OPENAI_API_KEY: "openai-key",
      REPLICATE_API_TOKEN: "replicate-token",
      ASSETS_DIR: "./assets",
      FFMPEG_PATH: "ffmpeg",
      APP_URL: "http://localhost:3000"
    });

    expect(env.OPENAI_API_KEY).toBe("openai-key");
    expect(env.REPLICATE_API_TOKEN).toBe("replicate-token");
    expect(env.ASSETS_DIR).toBe("./assets");
    expect(env.FFMPEG_PATH).toBe("ffmpeg");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.OPENAI_MODEL).toBe("gpt-4.1-mini");
    expect(env.OPENAI_TTS_MODEL).toBe("gpt-4o-mini-tts");
  });

  it("throws for an invalid app url", () => {
    expect(() =>
      loadServerEnv({
        OPENAI_API_KEY: "openai-key",
        REPLICATE_API_TOKEN: "replicate-token",
        ASSETS_DIR: "./assets",
        FFMPEG_PATH: "ffmpeg",
        APP_URL: "not-a-url"
      })
    ).toThrow("Invalid URL environment variable: APP_URL");
  });
});
