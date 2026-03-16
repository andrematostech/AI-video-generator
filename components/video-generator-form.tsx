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
    <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label
            htmlFor="prompt"
            className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500"
          >
            Video prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Example: Create a cinematic 20 second promo for a productivity app used by freelance designers."
            className="min-h-40 w-full rounded-3xl border border-orange-100 bg-sand px-5 py-4 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || prompt.trim().length === 0}
          className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? "Generating video..." : "Generate video"}
        </button>
      </form>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
