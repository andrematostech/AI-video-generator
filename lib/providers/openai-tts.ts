import OpenAI from "openai";
import { getServerEnv } from "@/lib/config/env.server";

const NARRATION_VOICE = "alloy";

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
  const audioResponse = await getOpenAiClient().audio.speech.create({
    model: env.OPENAI_TTS_MODEL,
    voice: NARRATION_VOICE,
    input: narration,
    response_format: "mp3"
  });

  return audioResponse.arrayBuffer();
}
