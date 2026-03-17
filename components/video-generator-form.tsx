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
            className="min-h-36 w-full rounded-[1.8rem] border border-white/10 bg-white/[0.04] px-7 py-6 text-lg leading-8 text-stone-100 outline-none transition duration-200 placeholder:text-stone-500 focus:border-[#8ab1ff]/45 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#8ab1ff]/18"
            required
          />
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isLoading || prompt.trim().length === 0}
            className="inline-flex min-w-[18rem] items-center justify-center rounded-full bg-[linear-gradient(90deg,#5ba3ff_0%,#7f82ff_48%,#d179ff_100%)] px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_28px_rgba(115,124,255,0.38)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-300 disabled:shadow-none"
          >
            {isLoading ? "Generating video..." : "Generate video"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-[1.25rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
