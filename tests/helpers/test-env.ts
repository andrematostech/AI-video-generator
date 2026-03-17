import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { resetServerEnvForTests } from "@/lib/config/env.server";
import { resetDatabaseForTests } from "@/lib/server/database";

export async function setupTestEnvironment() {
  const assetsDir = await mkdtemp(path.join(os.tmpdir(), "ai-video-generator-tests-"));

  Object.assign(process.env, {
    OPENAI_API_KEY: "test-openai-key",
    REPLICATE_API_TOKEN: "test-replicate-token",
    ASSETS_DIR: assetsDir,
    FFMPEG_PATH: "ffmpeg",
    APP_URL: "http://localhost:3000",
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
    REPLICATE_MODEL: "owner/model:version"
  });

  resetServerEnvForTests();
  await resetDatabaseForTests();

  return {
    assetsDir,
    async cleanup() {
      await resetDatabaseForTests();
      resetServerEnvForTests();
      await rm(assetsDir, { recursive: true, force: true });
    }
  };
}
