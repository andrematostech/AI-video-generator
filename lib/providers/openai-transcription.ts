import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/config/env.server";
import { runWithAbortTimeout } from "@/lib/providers/provider-timeout";
import { SubtitleSegment } from "@/lib/types";

type TranscriptionSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type VerboseTranscription = {
  segments?: TranscriptionSegment[];
};

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const OPENAI_TRANSCRIPTION_TIMEOUT_MS = 60_000;

function getOpenAiClient() {
  const env = getServerEnv();

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });
}

export async function transcribeNarration(audioPath: string): Promise<SubtitleSegment[]> {
  const transcript = (await runWithAbortTimeout(
    "OpenAI transcription",
    OPENAI_TRANSCRIPTION_TIMEOUT_MS,
    (signal) =>
      getOpenAiClient().audio.transcriptions.create(
        {
          file: createReadStream(audioPath),
          model: TRANSCRIPTION_MODEL,
          response_format: "verbose_json",
          timestamp_granularities: ["segment"]
        },
        { signal }
      )
  )) as VerboseTranscription;

  if (!Array.isArray(transcript.segments) || transcript.segments.length === 0) {
    throw new Error("OpenAI transcription did not return subtitle segments.");
  }

  return transcript.segments
    .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number")
    .map((segment, index) => {
      const text = String(segment.text ?? "").trim();

      if (!text) {
        throw new Error(`OpenAI transcription returned an empty subtitle segment at index ${index}.`);
      }

      return {
        startSeconds: Number(segment.start),
        endSeconds: Number(segment.end),
        text
      };
    });
}
