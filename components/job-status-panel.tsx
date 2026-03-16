"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VideoJobResult } from "@/lib/types";

type JobStatusPanelProps = {
  initialJob: VideoJobResult;
};

function getProgressPercent(job: VideoJobResult) {
  const total = job.progress.totalScenes;
  const completed = job.progress.completedScenes;

  if (job.status === "completed") {
    return 100;
  }

  if (total <= 0) {
    return job.status === "queued" ? 5 : 12;
  }

  return Math.max(12, Math.min(95, Math.round((completed / total) * 100)));
}

export function JobStatusPanel({ initialJob }: JobStatusPanelProps) {
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);

  const isTerminal = job.status === "completed" || job.status === "failed";
  const progressPercent = useMemo(() => getProgressPercent(job), [job]);

  useEffect(() => {
    if (isTerminal) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, {
          cache: "no-store"
        });
        const data = (await response.json()) as VideoJobResult | { error?: string };

        if (!response.ok) {
          throw new Error(("error" in data ? data.error : undefined) ?? "Failed to fetch job status.");
        }

        if (!("id" in data)) {
          throw new Error("Invalid job status response.");
        }

        setJob(data);
        setPollError(null);
      } catch (error) {
        setPollError(error instanceof Error ? error.message : "Polling failed.");
      }
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [isTerminal, job.id]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12">
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
            Job {job.id}
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">
            {job.status === "completed"
              ? "Video generation complete"
              : job.status === "failed"
                ? "Video generation failed"
                : "Video generation in progress"}
          </h1>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
            Status: {job.status}
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Current step: <span className="font-medium text-slate-900">{job.progress.currentStep}</span>
          </p>

          <div className="mt-5">
            <div className="h-3 overflow-hidden rounded-full bg-orange-100">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {job.progress.completedScenes}/{job.progress.totalScenes || 0} scenes processed
            </p>
          </div>

          <p className="mt-5 text-sm leading-7 text-slate-600">
            Final MP4 path:{" "}
            <span className="break-all text-slate-900">
              {job.outputVideoPath || "Not available yet"}
            </span>
          </p>

          {job.status === "completed" && job.outputVideoPath ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/jobs/${job.id}/result`}
                className="inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                View final video
              </Link>
              <a
                href={`/api/jobs/${job.id}/video`}
                download
                className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Download MP4
              </a>
            </div>
          ) : null}

          {job.error ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {job.error}
            </p>
          ) : null}

          {pollError ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {pollError}
            </p>
          ) : null}

          {job.script ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {job.script}
            </p>
          ) : null}
        </div>

        <section className="grid gap-4">
          {job.scenes.map((scene) => (
            <article
              key={scene.sceneIndex}
              className="rounded-3xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Scene {scene.sceneIndex}
                </h2>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
                  {scene.durationSeconds}s
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{scene.videoPrompt}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">{scene.narration}</p>
              {scene.clipPath ? (
                <p className="mt-3 break-all text-xs text-slate-400">{scene.clipPath}</p>
              ) : null}
            </article>
          ))}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Execution trace</h2>
          <div className="mt-4 space-y-3">
            {job.stepLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No step logs recorded yet.</p>
            ) : (
              job.stepLogs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{log.stepName}</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {log.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Started: {log.startedAt}
                    {log.endedAt ? ` • Ended: ${log.endedAt}` : ""}
                    {typeof log.durationMs === "number" ? ` • Duration: ${log.durationMs}ms` : ""}
                  </p>
                  {log.errorMessage ? (
                    <p className="mt-2 text-sm text-red-600">{log.errorMessage}</p>
                  ) : null}
                  {log.metadata ? (
                    <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
