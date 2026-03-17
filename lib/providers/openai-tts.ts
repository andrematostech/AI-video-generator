import OpenAI from "openai";
import { getServerEnv } from "@/lib/config/env.server";
import { runWithAbortTimeout } from "@/lib/providers/provider-timeout";

const NARRATION_VOICE = "alloy";
const OPENAI_TTS_TIMEOUT_MS = 60_000;

function getOpenAiClient() {
  const env = getServerEnv();

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });
}

export async function generateNarrationAudio(
  narration: string
): Promise<ArrayBuffer> {
  const env = getServerEnv();
  const audioResponse = await runWithAbortTimeout(
    "OpenAI narration generation",
    OPENAI_TTS_TIMEOUT_MS,
    (signal) =>
      getOpenAiClient().audio.speech.create(
        {
          model: env.OPENAI_TTS_MODEL,
          voice: NARRATION_VOICE,
          input: narration,
          response_format: "mp3"
        },
        { signal }
      )
  );

  return audioResponse.arrayBuffer();
}
