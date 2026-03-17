"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VideoJobResult, VideoScene } from "@/lib/types";

type JobStatusPanelProps = {
  initialJob: VideoJobResult;
};

function getProgressPercent(job: VideoJobResult) {
  const total = job.progress.totalScenes;
  const completed = job.progress.completedScenes;

  if (job.status === "completed") {
    return 100;
  }

  if (job.status === "awaiting_scene_approval") {
    return 35;
  }

  if (total <= 0) {
    return job.status === "queued" ? 5 : 12;
  }

  return Math.max(12, Math.min(95, Math.round((completed / total) * 100)));
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number") {
    return "Pending";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function JobStatusPanel({ initialJob }: JobStatusPanelProps) {
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [editableScenes, setEditableScenes] = useState<VideoScene[]>(initialJob.scenes);
  const [isSavingScenes, setIsSavingScenes] = useState(false);
  const [sceneSaveError, setSceneSaveError] = useState<string | null>(null);
  const [isSceneDirty, setIsSceneDirty] = useState(false);

  const isTerminal = job.status === "completed" || job.status === "failed";
  const progressPercent = useMemo(() => getProgressPercent(job), [job]);

  useEffect(() => {
    if (!isSceneDirty || job.status !== "awaiting_scene_approval") {
      setEditableScenes(job.scenes);
    }

    if (job.status !== "awaiting_scene_approval") {
      setIsSceneDirty(false);
    }
  }, [isSceneDirty, job.scenes, job.status]);

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

  function updateSceneValue(
    sceneIndex: number,
    field: "narration" | "videoPrompt" | "durationSeconds",
    value: string
  ) {
    setIsSceneDirty(true);
    setEditableScenes((currentScenes) =>
      currentScenes.map((scene) =>
        scene.sceneIndex === sceneIndex
          ? {
              ...scene,
              [field]:
                field === "durationSeconds" ? Number(value) || 0 : value
            }
          : scene
      )
    );
  }

  function moveScene(sceneIndex: number, direction: -1 | 1) {
    setIsSceneDirty(true);
    setEditableScenes((currentScenes) => {
      const currentIndex = currentScenes.findIndex((scene) => scene.sceneIndex === sceneIndex);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentScenes.length) {
        return currentScenes;
      }

      const reorderedScenes = [...currentScenes];
      const [movedScene] = reorderedScenes.splice(currentIndex, 1);
      reorderedScenes.splice(nextIndex, 0, movedScene);

      return reorderedScenes.map((scene, index) => ({
        ...scene,
        sceneIndex: index + 1
      }));
    });
  }

  async function submitScenes(action: "save" | "confirm") {
    setSceneSaveError(null);
    setIsSavingScenes(true);

    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          scenes: editableScenes.map((scene, index) => ({
            sceneIndex: index + 1,
            narration: scene.narration,
            videoPrompt: scene.videoPrompt,
            durationSeconds: scene.durationSeconds
          }))
        })
      });

      const data = (await response.json()) as VideoJobResult | { error?: string };

      if (!response.ok || !("id" in data)) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Failed to update scenes.");
      }

      setJob(data);
      setEditableScenes(data.scenes);
      setIsSceneDirty(false);
    } catch (error) {
      setSceneSaveError(error instanceof Error ? error.message : "Failed to update scenes.");
    } finally {
      setIsSavingScenes(false);
    }
  }

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
                : job.status === "awaiting_scene_approval"
                  ? "Review and edit scenes"
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

        {job.status === "awaiting_scene_approval" ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Scene editor</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Update narration, prompts, duration, and order before clip generation starts.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => submitScenes("save")}
                  disabled={isSavingScenes}
                  className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingScenes ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => submitScenes("confirm")}
                  disabled={isSavingScenes}
                  className="inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingScenes ? "Submitting..." : "Confirm scenes and generate"}
                </button>
              </div>
            </div>

            {sceneSaveError ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {sceneSaveError}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4">
              {editableScenes.map((scene, index) => (
                <article
                  key={`${scene.sceneIndex}-${index}`}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Scene {index + 1}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveScene(scene.sceneIndex, -1)}
                        disabled={index === 0 || isSavingScenes}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveScene(scene.sceneIndex, 1)}
                        disabled={index === editableScenes.length - 1 || isSavingScenes}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        Move down
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Narration</span>
                      <textarea
                        value={scene.narration}
                        onChange={(event) =>
                          updateSceneValue(scene.sceneIndex, "narration", event.target.value)
                        }
                        className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Video prompt</span>
                      <textarea
                        value={scene.videoPrompt}
                        onChange={(event) =>
                          updateSceneValue(scene.sceneIndex, "videoPrompt", event.target.value)
                        }
                        className="min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                    <label className="grid max-w-40 gap-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Duration (seconds)</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={scene.durationSeconds}
                        onChange={(event) =>
                          updateSceneValue(
                            scene.sceneIndex,
                            "durationSeconds",
                            event.target.value
                          )
                        }
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
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
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Performance metrics</h2>
          {job.performanceMetrics ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Script</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.scriptGenerationMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Scenes</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.scenePlanningMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Video clips</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.videoGenerationMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Narration</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.narrationGenerationMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Subtitles</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.subtitleGenerationMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rendering</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.renderingMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Metadata</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.metadataGenerationMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatDuration(job.performanceMetrics.totalPipelineMs)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Metrics will appear as soon as step timings are recorded.</p>
          )}
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
