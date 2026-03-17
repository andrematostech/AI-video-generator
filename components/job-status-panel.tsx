"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return "Not available";
  }

  return new Date(timestamp).toLocaleString();
}

function getStatusTone(status: VideoJobResult["status"]) {
  switch (status) {
    case "completed":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "failed":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    case "awaiting_scene_approval":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "queued":
      return "border-blue-400/20 bg-blue-500/10 text-blue-100";
    default:
      return "border-white/10 bg-white/[0.06] text-stone-100";
  }
}

function getStatusLabel(status: VideoJobResult["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "generating_script":
      return "Generating script";
    case "generating_scenes":
      return "Planning scenes";
    case "awaiting_scene_approval":
      return "Needs review";
    case "generating_video_clips":
      return "Generating clips";
    case "generating_narration":
      return "Generating narration";
    case "generating_subtitles":
      return "Generating subtitles";
    case "rendering_video":
      return "Rendering video";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function getStepState(job: VideoJobResult, stepStatuses: VideoJobResult["status"][]) {
  if (job.status === "completed") {
    return "complete";
  }

  if (stepStatuses.includes(job.status)) {
    return "current";
  }

  return "idle";
}

export function JobStatusPanel({ initialJob }: JobStatusPanelProps) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [editableScenes, setEditableScenes] = useState<VideoScene[]>(initialJob.scenes);
  const [isSavingScenes, setIsSavingScenes] = useState(false);
  const [sceneSaveError, setSceneSaveError] = useState<string | null>(null);
  const [isSceneDirty, setIsSceneDirty] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isTerminal = job.status === "completed" || job.status === "failed";
  const canCancel = job.status === "queued" || job.status === "awaiting_scene_approval";
  const activeStepLog = [...job.stepLogs].reverse().find((log) => log.status === "running");
  const progressPercent = useMemo(() => getProgressPercent(job), [job]);
  const pipelineSteps = [
    {
      label: "Script",
      statuses: ["generating_script"] as VideoJobResult["status"][]
    },
    {
      label: "Scenes",
      statuses: ["generating_scenes", "awaiting_scene_approval"] as VideoJobResult["status"][]
    },
    {
      label: "Video",
      statuses: ["generating_video_clips"] as VideoJobResult["status"][]
    },
    {
      label: "Narration",
      statuses: ["generating_narration"] as VideoJobResult["status"][]
    },
    {
      label: "Subtitles",
      statuses: ["generating_subtitles"] as VideoJobResult["status"][]
    },
    {
      label: "Rendering",
      statuses: ["rendering_video"] as VideoJobResult["status"][]
    }
  ];

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
              [field]: field === "durationSeconds" ? Number(value) || 0 : value
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

  async function cancelJob() {
    setPollError(null);
    setIsCancelling(true);

    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "cancel"
        })
      });

      const data = (await response.json()) as VideoJobResult | { error?: string };

      if (!response.ok || !("id" in data)) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Failed to cancel job.");
      }

      setJob(data);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Failed to cancel job.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 md:px-8 md:py-10">
      <div className="space-y-6">
        <section className="premium-shell overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                Job {job.id}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="inline-flex rounded-[0.9rem] border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:bg-white/[0.08]"
                >
                  Back
                </button>
                {canCancel ? (
                  <button
                    type="button"
                    onClick={cancelJob}
                    disabled={isCancelling}
                    className="inline-flex rounded-[0.9rem] border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCancelling ? "Cancelling..." : "Cancel job"}
                  </button>
                ) : null}
              </div>
            </div>
            <h1 className="mt-4 text-4xl leading-tight text-stone-50 md:text-5xl">
              {job.status === "completed"
                ? "Video generation complete"
                : job.status === "failed"
                  ? "Video generation failed"
                  : job.status === "awaiting_scene_approval"
                    ? "Review and edit scenes"
                    : "Video generation in progress"}
            </h1>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Status: {job.status}
            </p>
            <p className="mt-2 text-sm leading-7 text-stone-300">
              Current step:{" "}
              <span className="font-medium text-stone-100">{job.progress.currentStep}</span>
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={`rounded-[0.85rem] border px-4 py-3 ${getStatusTone(job.status)}`}>
                <p className="text-[11px] uppercase tracking-[0.2em] opacity-70">Job state</p>
                <p className="mt-2 text-sm font-semibold">{getStatusLabel(job.status)}</p>
              </div>
              <div className="rounded-[0.85rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-stone-100">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Attempt</p>
                <p className="mt-2 text-sm font-semibold">
                  {job.attemptCount || 0} / {job.maxAttempts}
                </p>
              </div>
              <div className="rounded-[0.85rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-stone-100">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Last updated</p>
                <p className="mt-2 text-sm font-semibold">{formatTimestamp(job.updatedAt)}</p>
              </div>
              <div className="rounded-[0.85rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-stone-100">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Trace status</p>
                <p className="mt-2 text-sm font-semibold">
                  {activeStepLog ? `Running ${activeStepLog.stepName.replaceAll("_", " ")}` : job.stepLogs.length > 0 ? `${job.stepLogs.length} events recorded` : "No step events yet"}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="grid gap-3 md:grid-cols-6">
                  {pipelineSteps.map((step) => {
                    const state = getStepState(job, step.statuses);

                    return (
                      <div
                        key={step.label}
                        className={`rounded-[0.85rem] border px-4 py-4 transition ${
                          state === "current"
                            ? "border-[#f4d9b6]/40 bg-[#f4d9b6]/12 text-stone-50 shadow-glow"
                            : state === "complete"
                              ? "border-white/10 bg-white/[0.08] text-stone-100"
                              : "border-white/10 bg-white/[0.04] text-stone-500"
                        }`}
                      >
                        <p className="text-[11px] uppercase tracking-[0.22em]">Step</p>
                        <p className="mt-2 text-base font-semibold">{step.label}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="h-2.5 overflow-hidden rounded-[0.7rem] bg-white/10">
                    <div
                      className="h-full rounded-[0.7rem] bg-gradient-to-r from-[#f4d9b6] via-[#dfbf94] to-[#8ca3ff] transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-stone-500">
                    {job.progress.completedScenes}/{job.progress.totalScenes || 0} scenes processed
                  </p>
                </div>
              </div>

              <div className="premium-panel p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  Pipeline summary
                </p>
                <p className="mt-4 text-sm leading-7 text-stone-300">
                  Final MP4 path:
                  <span className="mt-2 block break-all text-stone-100">
                    {job.outputVideoPath || "Not available yet"}
                  </span>
                </p>

                {job.status === "completed" && job.outputVideoPath ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/jobs/${job.id}/result`}
                      className="inline-flex rounded-[0.9rem] bg-[#f4d9b6] px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-[#f8e4c9]"
                    >
                      View final video
                    </Link>
                    <a
                      href={`/api/jobs/${job.id}/video`}
                      download
                      className="inline-flex rounded-[0.9rem] border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:bg-white/[0.08]"
                    >
                      Download MP4
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            {job.error ? (
              <p className="mt-5 rounded-[0.85rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {job.error}
              </p>
            ) : null}

            {pollError ? (
              <p className="mt-3 rounded-[0.85rem] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {pollError}
              </p>
            ) : null}

            {job.script ? (
              <p className="mt-6 max-w-4xl whitespace-pre-wrap text-sm leading-8 text-stone-300">
                {job.script}
              </p>
            ) : null}
          </div>
        </section>

        {job.status === "awaiting_scene_approval" ? (
          <section className="premium-panel p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl text-stone-50">Scene editor</h2>
                <p className="mt-1 text-sm text-stone-400">
                  Update narration, prompts, duration, and order before clip generation starts.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => submitScenes("save")}
                  disabled={isSavingScenes}
                  className="inline-flex rounded-[0.9rem] border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingScenes ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => submitScenes("confirm")}
                  disabled={isSavingScenes}
                  className="inline-flex rounded-[0.9rem] bg-[#f4d9b6] px-4 py-2 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingScenes ? "Submitting..." : "Confirm scenes and generate"}
                </button>
              </div>
            </div>

            {sceneSaveError ? (
              <p className="mt-4 rounded-[0.85rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {sceneSaveError}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4">
              {editableScenes.map((scene, index) => (
                <article
                  key={`${scene.sceneIndex}-${index}`}
                  className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl text-stone-50">Scene {index + 1}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveScene(scene.sceneIndex, -1)}
                        disabled={index === 0 || isSavingScenes}
                        className="rounded-[0.8rem] border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-stone-100 disabled:opacity-50"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveScene(scene.sceneIndex, 1)}
                        disabled={index === editableScenes.length - 1 || isSavingScenes}
                        className="rounded-[0.8rem] border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-stone-100 disabled:opacity-50"
                      >
                        Move down
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm text-stone-300">
                      <span className="font-semibold text-stone-50">Narration</span>
                      <textarea
                        value={scene.narration}
                        onChange={(event) =>
                          updateSceneValue(scene.sceneIndex, "narration", event.target.value)
                        }
                        className="min-h-24 rounded-[0.75rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-stone-100 outline-none focus:border-[#e7b67a]/60 focus:ring-2 focus:ring-[#e7b67a]/20"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-stone-300">
                      <span className="font-semibold text-stone-50">Video prompt</span>
                      <textarea
                        value={scene.videoPrompt}
                        onChange={(event) =>
                          updateSceneValue(scene.sceneIndex, "videoPrompt", event.target.value)
                        }
                        className="min-h-28 rounded-[0.75rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-stone-100 outline-none focus:border-[#e7b67a]/60 focus:ring-2 focus:ring-[#e7b67a]/20"
                      />
                    </label>
                    <label className="grid max-w-40 gap-2 text-sm text-stone-300">
                      <span className="font-semibold text-stone-50">Duration (seconds)</span>
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
                        className="rounded-[0.75rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-stone-100 outline-none focus:border-[#e7b67a]/60 focus:ring-2 focus:ring-[#e7b67a]/20"
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
                className="premium-panel p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl text-stone-50">Scene {scene.sceneIndex}</h2>
                  <span className="rounded-[0.8rem] border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-stone-200">
                    {scene.durationSeconds}s
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-stone-200">{scene.videoPrompt}</p>
                <p className="mt-3 text-sm leading-7 text-stone-400">{scene.narration}</p>
                {scene.clipPath ? (
                  <p className="mt-3 break-all text-xs text-stone-500">{scene.clipPath}</p>
                ) : null}
              </article>
            ))}
          </section>
        )}

        <section className="premium-panel p-5 md:p-6">
          <h2 className="text-2xl text-stone-50">Performance metrics</h2>
          {job.performanceMetrics ? (
            <div className="mt-4 grid gap-3 text-sm text-stone-300 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Script</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.scriptGenerationMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Scenes</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.scenePlanningMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Video clips</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.videoGenerationMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Narration</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.narrationGenerationMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Subtitles</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.subtitleGenerationMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Rendering</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.renderingMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Metadata</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.metadataGenerationMs)}
                </p>
              </div>
              <div className="rounded-[0.85rem] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Total</p>
                <p className="mt-2 text-base font-semibold text-stone-50">
                  {formatDuration(job.performanceMetrics.totalPipelineMs)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">Metrics will appear as soon as step timings are recorded.</p>
          )}
        </section>

        <section className="premium-panel p-5 md:p-6">
          <h2 className="text-2xl text-stone-50">Execution trace</h2>
          <div className="mt-4 space-y-3">
            {job.stepLogs.length === 0 ? (
              <p className="text-sm text-stone-500">No step logs recorded yet.</p>
            ) : (
              job.stepLogs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-[0.85rem] border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-100">
                      {log.stepName}
                    </p>
                    <span className="rounded-[0.8rem] border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-stone-300">
                      {log.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    Started: {log.startedAt}
                    {log.endedAt ? ` • Ended: ${log.endedAt}` : ""}
                    {typeof log.durationMs === "number" ? ` • Duration: ${log.durationMs}ms` : ""}
                  </p>
                  {log.errorMessage ? (
                    <p className="mt-2 text-sm text-red-300">{log.errorMessage}</p>
                  ) : null}
                  {log.metadata ? (
                    <pre className="mt-3 overflow-x-auto rounded-[0.6rem] bg-black/30 p-3 text-xs text-stone-200">
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
