import path from "node:path";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { resetServerEnvForTests } from "@/lib/config/env.server";
import { runDatabaseWrite } from "@/lib/server/database";
import { createVideoJob, readVideoJob, recordGeneratedAsset, updateVideoJob } from "@/lib/server/jobs";
import { runCleanupNow } from "@/lib/server/cleanup";
import { setupTestEnvironment } from "@/tests/helpers/test-env";

describe("runCleanupNow", () => {
  it("removes old temporary assets and keeps the final video by default", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      Object.assign(process.env, {
        CLEANUP_ENABLED: "true",
        CLEANUP_TEMP_FILE_TTL_HOURS: "1",
        CLEANUP_KEEP_FINAL_VIDEOS: "true"
      });
      resetServerEnvForTests();

      const jobId = "cleanup-job";
      const assetsDirectory = path.join(testEnv.assetsDir, jobId);
      const clipsDirectory = path.join(assetsDirectory, "clips");
      const audioDirectory = path.join(assetsDirectory, "audio");
      const subtitlesDirectory = path.join(assetsDirectory, "subtitles");
      const renderDirectory = path.join(assetsDirectory, "render");
      const finalVideoPath = path.join(assetsDirectory, "final-video.mp4");

      await mkdir(clipsDirectory, { recursive: true });
      await mkdir(audioDirectory, { recursive: true });
      await mkdir(subtitlesDirectory, { recursive: true });
      await mkdir(renderDirectory, { recursive: true });

      await writeFile(path.join(clipsDirectory, "scene-1.mp4"), "clip", "utf8");
      await writeFile(path.join(audioDirectory, "narration.mp3"), "audio", "utf8");
      await writeFile(path.join(subtitlesDirectory, "subtitles.srt"), "subtitle", "utf8");
      await writeFile(path.join(renderDirectory, "scene-1.mp4"), "render", "utf8");
      await writeFile(finalVideoPath, "final", "utf8");

      await createVideoJob({
        id: jobId,
        prompt: "Cleanup test prompt",
        assetsDirectory
      });

      await updateVideoJob(jobId, {
        status: "completed",
        outputVideoPath: finalVideoPath,
        narrationAudioPath: path.join(audioDirectory, "narration.mp3"),
        subtitlePath: path.join(subtitlesDirectory, "subtitles.srt"),
        scenes: [
          {
            sceneIndex: 1,
            narration: "Scene",
            videoPrompt: "Prompt",
            durationSeconds: 5,
            clipPath: path.join(clipsDirectory, "scene-1.mp4")
          }
        ],
        progress: {
          completedScenes: 1,
          totalScenes: 1,
          currentStep: "Completed"
        }
      });

      await recordGeneratedAsset({
        jobId,
        assetType: "scene_clip",
        filePath: path.join(clipsDirectory, "scene-1.mp4"),
        sceneIndex: 1
      });
      await recordGeneratedAsset({
        jobId,
        assetType: "narration_audio",
        filePath: path.join(audioDirectory, "narration.mp3")
      });
      await recordGeneratedAsset({
        jobId,
        assetType: "subtitle_file",
        filePath: path.join(subtitlesDirectory, "subtitles.srt")
      });
      await recordGeneratedAsset({
        jobId,
        assetType: "rendered_scene",
        filePath: path.join(renderDirectory, "scene-1.mp4"),
        sceneIndex: 1
      });
      await recordGeneratedAsset({
        jobId,
        assetType: "final_video",
        filePath: finalVideoPath
      });

      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(assetsDirectory, staleDate, staleDate);
      await runDatabaseWrite((db) => {
        db.run("UPDATE jobs SET updated_at = ? WHERE id = ?", [
          staleDate.toISOString(),
          jobId
        ]);
      });

      const result = await runCleanupNow();
      const job = await readVideoJob(jobId);

      expect(result.cleanedJobCount).toBe(1);
      expect(job.scenes[0]?.clipPath).toBeUndefined();
      expect(job.narrationAudioPath).toBeUndefined();
      expect(job.subtitlePath).toBeUndefined();
      expect(job.outputVideoPath).toBe(finalVideoPath);
      expect(job.generatedAssets.some((asset) => asset.assetType === "final_video")).toBe(true);
      expect(job.generatedAssets.some((asset) => asset.assetType === "scene_clip")).toBe(false);
    } finally {
      await rm(path.join(testEnv.assetsDir, "cleanup-job"), { recursive: true, force: true });
      await testEnv.cleanup();
    }
  });
});
