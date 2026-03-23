import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoJob, readVideoJob, updateVideoJob } from "@/lib/server/jobs";
import { processVideoJob } from "@/lib/server/pipeline";
import * as providers from "@/lib/providers";
import { setProviderModeForTests } from "@/lib/providers";
import { setupTestEnvironment } from "@/tests/helpers/test-env";

vi.mock("@/lib/server/ffmpeg", () => ({
  renderSceneClip: vi.fn(async ({ outputPath }: { outputPath: string }) => {
    await writeFile(outputPath, "mock-rendered-scene", "utf8");
  }),
  concatenateScenes: vi.fn(async (_scenePaths: string[], outputPath: string) => {
    await writeFile(outputPath, "mock-concatenated-video", "utf8");
  }),
  addNarrationTrack: vi.fn(
    async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, "mock-final-video", "utf8");
    }
  )
}));

describe("processVideoJob with mock providers", () => {
  beforeEach(() => {
    setProviderModeForTests("mock");
  });

  it("runs the pipeline without external API calls and persists outputs", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const jobId = "mock-pipeline-job";
      const assetsDirectory = path.join(testEnv.assetsDir, jobId);

      const queuedJob = await createVideoJob({
        id: jobId,
        prompt: "Create a mock AI video for testing",
        assetsDirectory
      });

      expect(queuedJob.status).toBe("queued");
      expect(queuedJob.progress.currentStep).toBe("Queued for background processing");

      await processVideoJob(jobId, "Create a mock AI video for testing");

      const plannedJob = await readVideoJob(jobId);

      expect(plannedJob.status).toBe("awaiting_scene_approval");
      expect(plannedJob.progress.currentStep).toBe(
        "Review scenes and confirm before video generation"
      );
      expect(plannedJob.scenes).toHaveLength(4);

      await updateVideoJob(jobId, {
        status: "queued",
        scenes: plannedJob.scenes.map((scene, index) => ({
          ...scene,
          narration:
            index === 0 ? "Updated narration before generation." : scene.narration
        })),
        progress: {
          completedScenes: 0,
          totalScenes: plannedJob.scenes.length,
          currentStep: "Queued after scene approval"
        }
      });

      await processVideoJob(jobId, "Create a mock AI video for testing");

      const job = await readVideoJob(jobId);
      const finalVideoContent = await readFile(job.outputVideoPath, "utf8");
      const narrationContent = await readFile(job.narrationAudioPath!, "utf8");
      const subtitleContent = await readFile(job.subtitlePath!, "utf8");

      expect(job.status).toBe("completed");
      expect(job.progress.currentStep).toBe("Completed");
      expect(job.title).toContain("Mock Video:");
      expect(job.videoMetadata?.shortDescription).toContain("mock-generated demo video");
      expect(job.videoMetadata?.tags).toEqual(["demo", "mock", "ai-video", "storytelling"]);
      expect(job.videoMetadata?.originalPrompt).toBe("Create a mock AI video for testing");
      expect(job.performanceMetrics?.scriptGenerationMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.scenePlanningMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.videoGenerationMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.narrationGenerationMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.subtitleGenerationMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.renderingMs).toBeTypeOf("number");
      expect(job.performanceMetrics?.totalPipelineMs).toBeTypeOf("number");
      expect(job.scenes).toHaveLength(4);
      expect(job.scenes[0]?.narration).toBe("Updated narration before generation.");
      expect(job.narrationAudioPath).toContain(path.join(jobId, "audio", "narration.mp3"));
      expect(job.subtitlePath).toContain(path.join(jobId, "subtitles", "subtitles.srt"));
      expect(job.outputVideoPath).toContain(path.join(jobId, "final-video.mp4"));
      expect(finalVideoContent).toBe("mock-final-video");
      expect(narrationContent).toContain("MOCK_AUDIO:");
      expect(subtitleContent).toContain("Updated narration before generation.");
      expect(job.generatedAssets.some((asset) => asset.assetType === "scene_clip")).toBe(true);
      expect(job.generatedAssets.some((asset) => asset.assetType === "narration_audio")).toBe(true);
      expect(job.generatedAssets.some((asset) => asset.assetType === "subtitle_file")).toBe(true);
      expect(job.generatedAssets.some((asset) => asset.assetType === "final_video")).toBe(true);
      expect(job.stepLogs.map((log) => log.stepName)).toEqual([
        "script_generation",
        "scene_planning",
        "video_clip_generation",
        "narration_generation",
        "subtitle_generation",
        "ffmpeg_rendering",
        "metadata_generation"
      ]);
      expect(job.stepLogs.every((log) => log.status === "completed")).toBe(true);
    } finally {
      setProviderModeForTests(null);
      await testEnv.cleanup();
    }
  });

  it("reuses existing clip files on retry instead of regenerating them", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const jobId = "mock-pipeline-reuse-job";
      const assetsDirectory = path.join(testEnv.assetsDir, jobId);

      await createVideoJob({
        id: jobId,
        prompt: "Create a reusable clip test video",
        assetsDirectory
      });

      await processVideoJob(jobId, "Create a reusable clip test video");

      const plannedJob = await readVideoJob(jobId);
      const existingClipPath = path.join(assetsDirectory, "clips", "scene-1.mp4");
      await writeFile(existingClipPath, "existing-clip", "utf8");

      await updateVideoJob(jobId, {
        status: "queued",
        scenes: plannedJob.scenes.map((scene, index) => ({
          ...scene,
          clipPath: index === 0 ? existingClipPath : undefined
        })),
        progress: {
          completedScenes: 0,
          totalScenes: plannedJob.scenes.length,
          currentStep: "Queued after retry"
        }
      });

      const clipSpy = vi.spyOn(providers, "generateSceneClip");

      await processVideoJob(jobId, "Create a reusable clip test video");

      expect(clipSpy).toHaveBeenCalledTimes(3);
      expect((await readFile(existingClipPath, "utf8"))).toBe("existing-clip");
    } finally {
      vi.restoreAllMocks();
      setProviderModeForTests(null);
      await testEnv.cleanup();
    }
  });
});
