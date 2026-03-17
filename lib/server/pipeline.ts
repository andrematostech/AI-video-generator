import path from "node:path";
import {
  ensureDirectories,
  buildProjectPaths,
  writeBuffer,
  writeText
} from "@/lib/server/filesystem";
import {
  addNarrationTrack,
  concatenateScenes,
  renderSceneClip
} from "@/lib/server/ffmpeg";
import {
  generateScript,
  generateVideoMetadata,
  generateVideoPlan,
  generateNarrationAudio,
  transcribeNarration,
  generateSceneClip
} from "@/lib/providers";
import { buildPerformanceMetrics, readPipelineStepLogs, tracePipelineStep } from "@/lib/server/observability";
import { buildSrt } from "@/lib/server/subtitles";
import {
  GeneratedScript,
  VideoJobResult,
  VideoMetadata,
  VideoPlan,
  VideoScene
} from "@/lib/types";
import { readVideoJob, recordGeneratedAsset, updateVideoJob } from "@/lib/server/jobs";

export async function processVideoJob(jobId: string, prompt: string) {
  const directories = buildProjectPaths(jobId);
  const existingJob = await readVideoJob(jobId);

  try {
    await ensureDirectories([
      directories.rootDirectory,
      directories.clipsDirectory,
      directories.audioDirectory,
      directories.subtitlesDirectory,
      directories.renderDirectory
    ]);

    const generatedScript = existingJob.script
      ? {
          title: existingJob.title,
          narrationScript: existingJob.script,
          targetDurationSeconds: existingJob.targetDurationSeconds
        }
      : await tracePipelineStep({
          jobId,
          stepName: "script_generation",
          metadata: {
            promptLength: prompt.length
          },
          run: () => runScriptStep(jobId, prompt),
          onSuccessMetadata: (result) => ({
            title: result.title,
            targetDurationSeconds: result.targetDurationSeconds
          })
        });
    const plan =
      existingJob.scenes.length > 0
        ? {
            title: existingJob.title,
            script: existingJob.script,
            targetDurationSeconds: existingJob.targetDurationSeconds,
            scenes: existingJob.scenes.map((scene) => ({
              ...scene,
              clipPath: undefined
            }))
          }
        : await tracePipelineStep({
            jobId,
            stepName: "scene_planning",
            metadata: {
              targetDurationSeconds: generatedScript.targetDurationSeconds
            },
            run: () => runSceneStep(jobId, prompt, generatedScript),
            onSuccessMetadata: (result) => ({
              sceneCount: result.scenes.length,
              totalPlannedDurationSeconds: result.scenes.reduce(
                (sum, scene) => sum + scene.durationSeconds,
                0
              )
            })
          });

    if (existingJob.scenes.length === 0) {
      return updateVideoJob(jobId, {
        status: "awaiting_scene_approval",
        title: plan.title,
        script: plan.script,
        targetDurationSeconds: plan.targetDurationSeconds,
        scenes: plan.scenes,
        progress: {
          completedScenes: 0,
          totalScenes: plan.scenes.length,
          currentStep: "Review scenes and confirm before video generation"
        }
      });
    }

    await tracePipelineStep({
      jobId,
      stepName: "video_clip_generation",
      metadata: {
        sceneCount: plan.scenes.length
      },
      run: () => runClipStep(jobId, directories, plan.scenes),
      onSuccessMetadata: () => ({
        generatedClipCount: plan.scenes.length
      })
    });
    const narrationAudioPath = await tracePipelineStep({
      jobId,
      stepName: "narration_generation",
      metadata: {
        sceneCount: plan.scenes.length
      },
      run: () => runNarrationStep(jobId, directories.audioDirectory, plan),
      onSuccessMetadata: (result) => ({
        narrationAudioPath: result
      })
    });
    const subtitlePath = await tracePipelineStep({
      jobId,
      stepName: "subtitle_generation",
      metadata: {
        narrationAudioPath
      },
      run: () => runSubtitleStep(jobId, directories.subtitlesDirectory, plan, narrationAudioPath),
      onSuccessMetadata: (result) => ({
        subtitlePath: result
      })
    });
    const outputVideoPath = await tracePipelineStep({
      jobId,
      stepName: "ffmpeg_rendering",
      metadata: {
        sceneCount: plan.scenes.length,
        subtitlePath
      },
      run: () =>
        runRenderStep(
          jobId,
          directories,
          plan.scenes,
          narrationAudioPath,
          subtitlePath
        ),
      onSuccessMetadata: (result) => ({
        outputVideoPath: result
      })
    });
    const videoMetadata = await tracePipelineStep({
      jobId,
      stepName: "metadata_generation",
      metadata: {
        promptLength: prompt.length,
        sceneCount: plan.scenes.length
      },
      run: () => runMetadataStep(jobId, prompt, plan),
      onSuccessMetadata: (result) => ({
        title: result.title,
        tagCount: result.tags.length
      })
    });
    const performanceMetrics = buildPerformanceMetrics(await readPipelineStepLogs(jobId));

    const result: VideoJobResult = {
      ...(await updateVideoJob(jobId, {
        status: "completed",
        title: videoMetadata.title,
        narrationAudioPath,
        subtitlePath,
        outputVideoPath,
        script: plan.script,
        targetDurationSeconds: plan.targetDurationSeconds,
        scenes: plan.scenes,
        videoMetadata,
        performanceMetrics,
        progress: {
          completedScenes: plan.scenes.length,
          totalScenes: plan.scenes.length,
          currentStep: "Completed"
        },
        error: undefined
      }))
    };

    return result;
  } catch (error) {
    throw error;
  }
}

async function runScriptStep(jobId: string, prompt: string) {
  await updatePipelineProgress(jobId, {
    status: "generating_script",
    currentStep: "Generating script"
  });

  return generateScript(prompt);
}

async function runSceneStep(
  jobId: string,
  prompt: string,
  generatedScript: GeneratedScript
) {
  await updatePipelineProgress(jobId, {
    status: "generating_scenes",
    currentStep: "Planning scenes",
    title: generatedScript.title,
    script: generatedScript.narrationScript,
    targetDurationSeconds: generatedScript.targetDurationSeconds
  });

  const plan = await generateVideoPlan(prompt, generatedScript);

  await updatePipelineProgress(jobId, {
    scenes: plan.scenes,
    totalScenes: plan.scenes.length,
    currentStep: "Planned scenes"
  });

  return plan;
}

async function runClipStep(
  jobId: string,
  directories: ReturnType<typeof buildProjectPaths>,
  scenes: VideoScene[]
) {
  await updatePipelineProgress(jobId, {
    status: "generating_video_clips",
    totalScenes: scenes.length,
    currentStep: "Generating video clips",
    scenes
  });

  for (const [index, scene] of scenes.entries()) {
    const clipPath = path.join(directories.clipsDirectory, `scene-${scene.sceneIndex}.mp4`);

    const clipResult = await generateSceneClip({
      prompt: scene.videoPrompt,
      durationSeconds: scene.durationSeconds,
      outputPath: clipPath,
      maxRetries: 2
    });

    scene.clipPath = clipPath;
    await recordGeneratedAsset({
      jobId,
      assetType: "scene_clip",
      filePath: clipPath,
      sceneIndex: scene.sceneIndex,
      sourceUrl: clipResult.sourceUrl
    });

    await updatePipelineProgress(jobId, {
      scenes,
      totalScenes: scenes.length,
      completedScenes: index + 1,
      currentStep: `Generated clip ${index + 1} of ${scenes.length}`
    });
  }
}

async function runNarrationStep(
  jobId: string,
  audioDirectory: string,
  plan: VideoPlan
) {
  await updatePipelineProgress(jobId, {
    status: "generating_narration",
    scenes: plan.scenes,
    totalScenes: plan.scenes.length,
    completedScenes: plan.scenes.length,
    currentStep: "Generating narration"
  });

  const combinedNarration = plan.scenes.map((scene) => scene.narration).join(" ");
  const narrationBuffer = await generateNarrationAudio(combinedNarration);
  const narrationAudioPath = path.join(audioDirectory, "narration.mp3");
  await writeBuffer(narrationAudioPath, narrationBuffer);

  return narrationAudioPath;
}

async function runSubtitleStep(
  jobId: string,
  subtitlesDirectory: string,
  plan: VideoPlan,
  narrationAudioPath: string
) {
  await updatePipelineProgress(jobId, {
    status: "generating_subtitles",
    narrationAudioPath,
    totalScenes: plan.scenes.length,
    completedScenes: plan.scenes.length,
    currentStep: "Generating subtitles"
  });

  const subtitleSegments = await transcribeNarration(narrationAudioPath);
  const subtitlePath = path.join(subtitlesDirectory, "subtitles.srt");
  await writeText(subtitlePath, buildSrt(subtitleSegments));

  return subtitlePath;
}

async function runMetadataStep(
  jobId: string,
  prompt: string,
  plan: VideoPlan
): Promise<VideoMetadata> {
  await updatePipelineProgress(jobId, {
    status: "rendering_video",
    totalScenes: plan.scenes.length,
    completedScenes: plan.scenes.length,
    currentStep: "Generating video metadata"
  });

  const metadata = await generateVideoMetadata({
    prompt,
    script: plan.script,
    scenes: plan.scenes
  });

  return {
    ...metadata,
    generationTimestamp: new Date().toISOString(),
    originalPrompt: prompt
  };
}

async function runRenderStep(
  jobId: string,
  directories: ReturnType<typeof buildProjectPaths>,
  scenes: VideoScene[],
  narrationAudioPath: string,
  subtitlePath: string
) {
  await updatePipelineProgress(jobId, {
    status: "rendering_video",
    subtitlePath,
    totalScenes: scenes.length,
    completedScenes: scenes.length,
    currentStep: "Normalizing clips and rendering final video"
  });

  const renderedScenePaths: string[] = [];

  for (const scene of scenes) {
    const clipPath = path.join(directories.clipsDirectory, `scene-${scene.sceneIndex}.mp4`);
    const renderedScenePath = path.join(directories.renderDirectory, `scene-${scene.sceneIndex}.mp4`);

    await renderSceneClip({
      clipPath,
      outputPath: renderedScenePath
    });

    await recordGeneratedAsset({
      jobId,
      assetType: "rendered_scene",
      filePath: renderedScenePath,
      sceneIndex: scene.sceneIndex
    });

    renderedScenePaths.push(renderedScenePath);
  }

  const concatenatedVideoPath = path.join(directories.renderDirectory, "final-silent.mp4");
  await concatenateScenes(renderedScenePaths, concatenatedVideoPath);

  const outputVideoPath = path.join(directories.rootDirectory, "final-video.mp4");
  await addNarrationTrack({
    videoPath: concatenatedVideoPath,
    narrationPath: narrationAudioPath,
    subtitlePath,
    outputPath: outputVideoPath
  });

  return outputVideoPath;
}

async function updatePipelineProgress(
  jobId: string,
  options: {
    status?: VideoJobResult["status"];
    currentStep: string;
    completedScenes?: number;
    totalScenes?: number;
    title?: string;
    script?: string;
    targetDurationSeconds?: number;
    scenes?: VideoScene[];
    narrationAudioPath?: string;
    subtitlePath?: string;
  }
) {
  return updateVideoJob(jobId, {
    status: options.status,
    title: options.title,
    script: options.script,
    targetDurationSeconds: options.targetDurationSeconds,
    scenes: options.scenes,
    narrationAudioPath: options.narrationAudioPath,
    subtitlePath: options.subtitlePath,
    progress: {
      completedScenes: options.completedScenes ?? 0,
      totalScenes: options.totalScenes ?? options.scenes?.length ?? 0,
      currentStep: options.currentStep
    }
  });
}
