import Link from "next/link";
import { readVideoJob } from "@/lib/server/jobs";

type JobResultPageProps = {
  params: {
    jobId: string;
  };
};

export default async function JobResultPage({ params }: JobResultPageProps) {
  const job = await readVideoJob(params.jobId);
  const metadata = job.videoMetadata;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 md:px-8 md:py-10">
      <section className="premium-shell overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_26%)]" />
        <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Final video
        </p>
        <h1 className="mt-4 text-4xl leading-tight text-stone-50 md:text-5xl">
          {metadata?.title || job.title || "Generated video"}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-stone-300">{job.prompt}</p>

        {metadata ? (
          <div className="mt-6 premium-panel p-5">
            <p className="text-sm leading-7 text-stone-300">{metadata.shortDescription}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-200"
                >
                  {tag}
                </span>
              ))}
            </div>
            <dl className="mt-5 grid gap-4 text-sm text-stone-400 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-stone-100">Generated</dt>
                <dd>{new Date(metadata.generationTimestamp).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="font-semibold text-stone-100">Original prompt</dt>
                <dd>{metadata.originalPrompt}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {job.status === "completed" && job.outputVideoPath ? (
          <>
            <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/40 shadow-soft">
              <video
                controls
                className="aspect-video w-full"
                src={`/api/jobs/${job.id}/video`}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`/api/jobs/${job.id}/video`}
                download
                className="inline-flex rounded-full bg-[#f4d9b6] px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-[#f8e4c9]"
              >
                Download MP4
              </a>
              <Link
                href={`/jobs/${job.id}`}
                className="inline-flex rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-stone-100 transition hover:bg-white/[0.08]"
              >
                Back to job status
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
            The final video is not ready yet. Check the job status page for progress updates.
          </div>
        )}
        </div>
      </section>
    </main>
  );
}
