import Link from "next/link";
import { readVideoJob } from "@/lib/server/jobs";

type JobResultPageProps = {
  params: {
    jobId: string;
  };
};

export default async function JobResultPage({ params }: JobResultPageProps) {
  const job = await readVideoJob(params.jobId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12">
      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
          Final video
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">
          {job.title || "Generated video"}
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">{job.prompt}</p>

        {job.status === "completed" && job.outputVideoPath ? (
          <>
            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950">
              <video
                controls
                className="aspect-video w-full"
                src={`/api/jobs/${job.id}/video`}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={`/api/jobs/${job.id}/video`}
                download
                className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
              >
                Download MP4
              </a>
              <Link
                href={`/jobs/${job.id}`}
                className="inline-flex rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Back to job status
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            The final video is not ready yet. Check the job status page for progress updates.
          </div>
        )}
      </section>
    </main>
  );
}
