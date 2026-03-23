import { createVideoJob, isVideoJobCancelled, markVideoJobFailed, readVideoJob, updateVideoJob } from "@/lib/server/jobs";
import { setupTestEnvironment } from "@/tests/helpers/test-env";

describe("job status transitions", () => {
  it("creates and transitions a job through queued, running, and failed states", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-status-test",
        prompt: "Create a product video",
        assetsDirectory: `${testEnv.assetsDir}/job-status-test`,
        maxAttempts: 3
      });

      expect(created.status).toBe("queued");
      expect(created.videoResolution).toBe("720p");
      expect(created.videoStyleMode).toBe("realistic");
      expect(created.generationControls.cfgScale).toBe(0.5);
      expect(created.progress.currentStep).toBe("Queued for background processing");

      const running = await updateVideoJob(created.id, {
        status: "generating_scenes",
        title: "Video title",
        script: "Narration script",
        targetDurationSeconds: 24,
        progress: {
          completedScenes: 0,
          totalScenes: 4,
          currentStep: "Planning scenes"
        },
        scenes: [
          {
            sceneIndex: 1,
            narration: "Scene one",
            videoPrompt: "Prompt one",
            durationSeconds: 6
          },
          {
            sceneIndex: 2,
            narration: "Scene two",
            videoPrompt: "Prompt two",
            durationSeconds: 6
          },
          {
            sceneIndex: 3,
            narration: "Scene three",
            videoPrompt: "Prompt three",
            durationSeconds: 6
          },
          {
            sceneIndex: 4,
            narration: "Scene four",
            videoPrompt: "Prompt four",
            durationSeconds: 6
          }
        ]
      });

      expect(running.status).toBe("generating_scenes");
      expect(running.progress.totalScenes).toBe(4);
      expect(running.scenes).toHaveLength(4);

      const failed = await markVideoJobFailed(created.id, "Replicate request failed");

      expect(failed.status).toBe("failed");
      expect(failed.error).toBe("Replicate request failed");
      expect(failed.progress.currentStep).toBe("Job failed");

      const persisted = await readVideoJob(created.id);
      expect(persisted.status).toBe("failed");
      expect(persisted.videoResolution).toBe("720p");
      expect(persisted.videoStyleMode).toBe("realistic");
      expect(persisted.generationControls.cfgScale).toBe(0.5);
      expect(persisted.scenes[0]?.sceneIndex).toBe(1);
    } finally {
      await testEnv.cleanup();
    }
  });

  it("clears stale job errors after a later successful update", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-error-clear-test",
        prompt: "Create a calm nature video",
        assetsDirectory: `${testEnv.assetsDir}/job-error-clear-test`
      });

      await markVideoJobFailed(created.id, "Temporary provider timeout");

      const recovered = await updateVideoJob(
        created.id,
        {
          status: "awaiting_scene_approval",
          progress: {
            completedScenes: 0,
            totalScenes: 4,
            currentStep: "Review scenes and confirm before video generation"
          }
        },
        {
          clearError: true
        }
      );

      expect(recovered.status).toBe("awaiting_scene_approval");
      expect(recovered.error).toBeUndefined();
    } finally {
      await testEnv.cleanup();
    }
  });

  it("persists a 1080p job resolution when explicitly requested", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-resolution-test",
        prompt: "Create a high-end futuristic city video",
        assetsDirectory: `${testEnv.assetsDir}/job-resolution-test`,
        videoResolution: "1080p"
      });

      expect(created.videoResolution).toBe("1080p");

      const persisted = await readVideoJob(created.id);
      expect(persisted.videoResolution).toBe("1080p");
    } finally {
      await testEnv.cleanup();
    }
  });

  it("persists a stylized job mode when explicitly requested", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-style-mode-test",
        prompt: "Create a graphic novel cyberpunk video",
        assetsDirectory: `${testEnv.assetsDir}/job-style-mode-test`,
        videoStyleMode: "stylized"
      });

      expect(created.videoStyleMode).toBe("stylized");

      const persisted = await readVideoJob(created.id);
      expect(persisted.videoStyleMode).toBe("stylized");
    } finally {
      await testEnv.cleanup();
    }
  });

  it("persists replicate generation controls when explicitly requested", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-generation-controls-test",
        prompt: "Create a photoreal underwater portrait video",
        assetsDirectory: `${testEnv.assetsDir}/job-generation-controls-test`,
        generationControls: {
          negativePrompt: "cartoon, anime, illustration",
          cfgScale: 0.8,
          startImagePath: `${testEnv.assetsDir}/job-generation-controls-test/inputs/start-image.png`
        }
      });

      expect(created.generationControls.cfgScale).toBe(0.8);
      expect(created.generationControls.negativePrompt).toContain("cartoon");
      expect(created.generationControls.startImagePath).toContain("start-image.png");

      const persisted = await readVideoJob(created.id);
      expect(persisted.generationControls.cfgScale).toBe(0.8);
      expect(persisted.generationControls.negativePrompt).toContain("anime");
      expect(persisted.generationControls.startImagePath).toContain("start-image.png");
    } finally {
      await testEnv.cleanup();
    }
  });

  it("marks a job as cancelled and exposes that state", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const created = await createVideoJob({
        id: "job-cancel-test",
        prompt: "Create a cyberpunk test video",
        assetsDirectory: `${testEnv.assetsDir}/job-cancel-test`
      });

      const cancelled = await updateVideoJob(created.id, {
        status: "cancelled",
        error: "Cancelled by user.",
        progress: {
          completedScenes: 1,
          totalScenes: 4,
          currentStep: "Cancelled by user"
        }
      });

      expect(cancelled.status).toBe("cancelled");
      expect(await isVideoJobCancelled(created.id)).toBe(true);
    } finally {
      await testEnv.cleanup();
    }
  });
});
