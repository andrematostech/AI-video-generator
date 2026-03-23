import { VideoGeneratorForm } from "@/components/video-generator-form";
import { JobStatusPanel } from "@/components/job-status-panel";
import { readVideoJob } from "@/lib/server/jobs";

const promptModes = [
  "Advertising studio",
  "Dynamic captions",
  "Create short video",
  "Make explainer video",
  "Use my script"
] as const;

type HomePageProps = {
  searchParams?: {
    job?: string;
  };
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const jobId = searchParams?.job?.trim();
  const initialJob = jobId ? await readVideoJob(jobId).catch(() => null) : null;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-6">
      <div className="hero-glow" />

      <header className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-[1.75rem] font-semibold tracking-[-0.05em] text-white">
            Lumo
          </div>
          <p className="hidden text-xs text-stone-500 md:block">
            Turn prompts into cinematic videos
          </p>
        </div>
        <div className="hidden text-xs font-medium text-stone-500 md:block">
          AI video generator MVP
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col py-6">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Lumo workspace
            </p>
            <h1 className="max-w-xl text-[2rem] font-medium leading-[1.02] tracking-[-0.05em] text-stone-50 md:text-[2.7rem]">
              Generate AI videos from a single prompt
            </h1>
            <p className="max-w-md text-sm leading-6 text-stone-400">
              Write the idea, choose the output quality, and let Lumo handle script,
              scenes, narration, subtitles, and rendering.
            </p>
          </div>

          <div className="space-y-4">
            <div className="premium-panel px-4 py-4 md:px-5 md:py-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex rounded-[0.7rem] border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-stone-300">
                  v4.0
                </span>
                <span className="text-xs text-stone-500">Prompt to cinematic MP4</span>
              </div>
              <VideoGeneratorForm
                initialVideoResolution={initialJob?.videoResolution ?? "720p"}
                initialVideoStyleMode={initialJob?.videoStyleMode ?? "realistic"}
                initialNegativePrompt={initialJob?.generationControls.negativePrompt ?? ""}
                initialCfgScale={initialJob?.generationControls.cfgScale ?? 0.5}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {promptModes.map((mode) => (
                <span
                  key={mode}
                  className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-stone-300"
                >
                  {mode}
                </span>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="border-b border-white/10 pb-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Script + scenes
                </p>
                <p className="mt-2 text-sm text-stone-200">OpenAI planning pipeline</p>
              </div>
              <div className="border-b border-white/10 pb-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Video clips
                </p>
                <p className="mt-2 text-sm text-stone-200">Replicate-generated scenes</p>
              </div>
              <div className="border-b border-white/10 pb-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Final render
                </p>
                <p className="mt-2 text-sm text-stone-200">FFmpeg narration + subtitles</p>
              </div>
            </div>
          </div>
        </div>

        {initialJob ? (
          <section className="mt-5">
            <JobStatusPanel initialJob={initialJob} embedded />
          </section>
        ) : null}
      </section>
    </main>
  );
}
