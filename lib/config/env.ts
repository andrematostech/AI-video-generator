type RawEnv = Record<string, string | undefined>;

export type ServerEnv = {
  OPENAI_API_KEY: string;
  REPLICATE_API_TOKEN: string;
  ASSETS_DIR: string;
  FFMPEG_PATH: string;
  APP_URL: string;
  OPENAI_MODEL: string;
  OPENAI_TTS_MODEL: string;
  REPLICATE_MODEL: string;
};

function readRequiredString(env: RawEnv, key: keyof ServerEnv) {
  const value = env[key];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function readOptionalString(
  env: RawEnv,
  key: keyof ServerEnv,
  fallback: string
) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function readUrl(env: RawEnv, key: keyof ServerEnv) {
  const value = readRequiredString(env, key);

  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL environment variable: ${key}`);
  }
}

export function loadServerEnv(rawEnv: RawEnv = process.env): ServerEnv {
  return {
    OPENAI_API_KEY: readRequiredString(rawEnv, "OPENAI_API_KEY"),
    REPLICATE_API_TOKEN: readRequiredString(rawEnv, "REPLICATE_API_TOKEN"),
    ASSETS_DIR: readRequiredString(rawEnv, "ASSETS_DIR"),
    FFMPEG_PATH: readRequiredString(rawEnv, "FFMPEG_PATH"),
    APP_URL: readUrl(rawEnv, "APP_URL"),
    OPENAI_MODEL: readOptionalString(rawEnv, "OPENAI_MODEL", "gpt-4.1-mini"),
    OPENAI_TTS_MODEL: readOptionalString(
      rawEnv,
      "OPENAI_TTS_MODEL",
      "gpt-4o-mini-tts"
    ),
    REPLICATE_MODEL: readOptionalString(
      rawEnv,
      "REPLICATE_MODEL",
      "kwaivgi/kling-v1.6-standard"
    )
  };
}
