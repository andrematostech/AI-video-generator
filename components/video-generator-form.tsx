"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoJobResult } from "@/lib/types";

export function VideoGeneratorForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      const data = (await response.json()) as VideoJobResult | { error?: string };

      if (!response.ok) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Video generation failed.");
      }

      if (!("id" in data)) {
        throw new Error("Video generation did not return a job id.");
      }

      router.push(`/jobs/${data.id}`);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unexpected error while generating the video."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-3">
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Create a cinematic 30 second video about black holes and their mysteries..."
            className="hero-input min-h-28 rounded-[1.05rem] px-6 py-5 text-base leading-7"
            required
          />
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isLoading || prompt.trim().length === 0}
            className="hero-button min-w-[15rem] rounded-[1rem] px-7 py-3.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:transform-none"
          >
            {isLoading ? "Generating video..." : "Generate video"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-[0.75rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
