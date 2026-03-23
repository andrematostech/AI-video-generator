"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoJobResult, VideoResolution, VideoStyleMode } from "@/lib/types";

const LATEST_JOB_STORAGE_KEY = "lumo-latest-job-id";

type VideoGeneratorFormProps = {
  initialVideoResolution?: VideoResolution;
  initialVideoStyleMode?: VideoStyleMode;
  initialNegativePrompt?: string;
  initialCfgScale?: number;
};

export function VideoGeneratorForm({
  initialVideoResolution = "720p",
  initialVideoStyleMode = "realistic",
  initialNegativePrompt = "",
  initialCfgScale = 0.5
}: VideoGeneratorFormProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<VideoResolution>(initialVideoResolution);
  const [videoStyleMode, setVideoStyleMode] = useState<VideoStyleMode>(initialVideoStyleMode);
  const [negativePrompt, setNegativePrompt] = useState(initialNegativePrompt);
  const [cfgScale, setCfgScale] = useState(initialCfgScale);
  const [startImageFile, setStartImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setLatestJobId(window.localStorage.getItem(LATEST_JOB_STORAGE_KEY));
  }, []);

  useEffect(() => {
    setVideoResolution(initialVideoResolution);
  }, [initialVideoResolution]);

  useEffect(() => {
    setVideoStyleMode(initialVideoStyleMode);
  }, [initialVideoStyleMode]);

  useEffect(() => {
    setNegativePrompt(initialNegativePrompt);
  }, [initialNegativePrompt]);

  useEffect(() => {
    setCfgScale(initialCfgScale);
  }, [initialCfgScale]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.set("prompt", prompt);
      formData.set("videoResolution", videoResolution);
      formData.set("videoStyleMode", videoStyleMode);
      formData.set("negativePrompt", negativePrompt);
      formData.set("cfgScale", String(cfgScale));

      if (startImageFile) {
        formData.set("startImage", startImageFile);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData
      });

      const data = (await response.json()) as VideoJobResult | { error?: string };

      if (!response.ok) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Video generation failed.");
      }

      if (!("id" in data)) {
        throw new Error("Video generation did not return a job id.");
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LATEST_JOB_STORAGE_KEY, data.id);
        setLatestJobId(data.id);
      }

      router.push(`/?job=${data.id}`);
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
            className="hero-input min-h-[9rem] rounded-[0.9rem] px-5 py-4 text-sm leading-6"
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Style mode
            </p>
            <div className="inline-flex rounded-[0.9rem] border border-white/10 bg-white/[0.04] p-1">
              {(["realistic", "stylized"] as VideoStyleMode[]).map((mode) => {
                const isActive = videoStyleMode === mode;

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setVideoStyleMode(mode)}
                    className={`rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold capitalize transition ${
                      isActive
                        ? "bg-[#f4d9b6] text-stone-950 shadow-[0_8px_24px_rgba(244,217,182,0.24)]"
                        : "text-stone-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Export resolution
            </p>
            <div className="inline-flex rounded-[0.9rem] border border-white/10 bg-white/[0.04] p-1">
              {(["720p", "1080p"] as VideoResolution[]).map((resolution) => {
                const isActive = videoResolution === resolution;

                return (
                  <button
                    key={resolution}
                    type="button"
                    onClick={() => setVideoResolution(resolution)}
                    className={`rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "bg-[#f4d9b6] text-stone-950 shadow-[0_8px_24px_rgba(244,217,182,0.24)]"
                        : "text-stone-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    {resolution}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Negative prompt
              <input
                type="text"
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder="cartoon, anime, illustration, extra limbs"
                className="hero-input rounded-[0.9rem] px-4 py-3 text-sm normal-case tracking-normal text-stone-100"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Start image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setStartImageFile(event.target.files?.[0] ?? null)}
                className="block rounded-[0.9rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm normal-case tracking-normal text-stone-300 file:mr-3 file:rounded-[0.7rem] file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-100"
              />
            </label>
          </div>
          <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
            CFG scale
            <div className="flex items-center gap-4 rounded-[0.9rem] border border-white/10 bg-white/[0.04] px-4 py-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={cfgScale}
                onChange={(event) => setCfgScale(Number(event.target.value))}
                className="w-full accent-[#f4d9b6]"
              />
              <span className="min-w-10 text-right text-sm normal-case tracking-normal text-stone-100">
                {cfgScale.toFixed(1)}
              </span>
            </div>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">
            Lumo handles script, scenes, clips, narration, subtitles, and the final render.
            {videoStyleMode === "realistic"
              ? " Realistic mode pushes prompts toward live-action, photorealistic output."
              : " Stylized mode preserves more graphic, illustrated, and overtly designed aesthetics."}
          </span>
          <button
            type="submit"
            disabled={isLoading || prompt.trim().length === 0}
            className="hero-button min-w-[12rem] rounded-[0.9rem] px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:transform-none"
          >
            {isLoading ? "Generating video..." : "Generate video"}
          </button>
        </div>
      </form>

      {latestJobId ? (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => router.push(`/?job=${latestJobId}`)}
            className="inline-flex items-center rounded-[0.9rem] border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-200 transition hover:bg-white/[0.08]"
          >
            Resume latest job
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[0.75rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
