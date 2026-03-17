import { createVideoJob, markVideoJobFailed, readVideoJob, updateVideoJob } from "@/lib/server/jobs";
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
      expect(persisted.scenes[0]?.sceneIndex).toBe(1);
    } finally {
      await testEnv.cleanup();
    }
  });
});
