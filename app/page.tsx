import { VideoGeneratorForm } from "@/components/video-generator-form";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-orange-200 bg-white/80 px-4 py-1 text-sm font-medium text-orange-700 shadow-sm">
            Prompt to MP4 MVP
          </span>
          <div className="space-y-4">
            <h1 className="font-display text-5xl leading-tight text-slate-900 md:text-6xl">
              Generate short AI videos from a single prompt.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              This MVP turns one idea into a script, scene plan, narrated visuals,
              subtitles, and a rendered MP4 saved on the local filesystem.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "OpenAI for scripting, narration, and subtitles",
              "Replicate for scene video clip generation",
              "FFmpeg for stitching scenes into a final MP4"
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/70 bg-white/80 p-4 text-sm text-slate-700 shadow-soft backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <VideoGeneratorForm />
      </section>
    </main>
  );
}
