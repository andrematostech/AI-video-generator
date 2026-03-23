import path from "node:path";
import {
  ensureDirectories,
  buildProjectPaths,
  pathExists,
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
  VideoResolution,
  VideoScene
} from "@/lib/types";
import { isVideoJobCancelled, readVideoJob, recordGeneratedAsset, updateVideoJob } from "@/lib/server/jobs";

function logPipelineEvent(jobId: string, message: string) {
  console.log(`[pipeline:${jobId}] ${message}`);
}

async function throwIfJobCancelled(jobId: string) {
  if (await isVideoJobCancelled(jobId)) {
    throw new Error("Job was cancelled by user.");
  }
}

export async function processVideoJob(jobId: string, prompt: string) {
  const directories = buildProjectPaths(jobId);
  const existingJob = await readVideoJob(jobId);
  const videoStyleMode = existingJob.videoStyleMode;
  const generationControls = existingJob.generationControls;

  try {
    await throwIfJobCancelled(jobId);
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
        run: () => runScriptStep(jobId, prompt, videoStyleMode),
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
              ...scene
            }))
          }
        : await tracePipelineStep({
            jobId,
            stepName: "scene_planning",
            metadata: {
              targetDurationSeconds: generatedScript.targetDurationSeconds
            },
            run: () => runSceneStep(jobId, prompt, generatedScript, videoStyleMode),
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
      }, {
        clearError: true
      });
    }

    await tracePipelineStep({
      jobId,
      stepName: "video_clip_generation",
      metadata: {
        sceneCount: plan.scenes.length
      },
      run: () => runClipStep(jobId, directories, plan.scenes, generationControls),
      onSuccessMetadata: () => ({
        generatedClipCount: plan.scenes.length
      })
    });
    const narrationAudioPath = await getOrCreateNarrationAudioPath(
      jobId,
      directories.audioDirectory,
      plan,
      existingJob.narrationAudioPath
    );
    const subtitlePath = await getOrCreateSubtitlePath(
      jobId,
      directories.subtitlesDirectory,
      plan,
      narrationAudioPath,
      existingJob.subtitlePath
    );
    const outputVideoPath = await getOrCreateOutputVideoPath(
      jobId,
      directories,
      plan.scenes,
      narrationAudioPath,
      subtitlePath,
      existingJob.outputVideoPath,
      existingJob.videoResolution
    );
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
      }, {
        clearError: true
      }))
    };

    return result;
  } catch (error) {
    throw error;
  }
}

async function runScriptStep(
  jobId: string,
  prompt: string,
  videoStyleMode: VideoJobResult["videoStyleMode"]
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting script generation.");
  await updatePipelineProgress(jobId, {
    status: "generating_script",
    currentStep: "Generating script"
  });

  const script = await generateScript(prompt, videoStyleMode);
  logPipelineEvent(jobId, `Generated script "${script.title}" (${script.targetDurationSeconds}s target).`);
  return script;
}

async function runSceneStep(
  jobId: string,
  prompt: string,
  generatedScript: GeneratedScript,
  videoStyleMode: VideoJobResult["videoStyleMode"]
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting scene planning.");
  await updatePipelineProgress(jobId, {
    status: "generating_scenes",
    currentStep: "Planning scenes",
    title: generatedScript.title,
    script: generatedScript.narrationScript,
    targetDurationSeconds: generatedScript.targetDurationSeconds
  });

  const plan = await generateVideoPlan(prompt, generatedScript, videoStyleMode);
  logPipelineEvent(jobId, `Planned ${plan.scenes.length} scenes.`);

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
  scenes: VideoScene[],
  generationControls: VideoJobResult["generationControls"]
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, `Starting video clip generation for ${scenes.length} scenes.`);
  await updatePipelineProgress(jobId, {
    status: "generating_video_clips",
    totalScenes: scenes.length,
    currentStep: "Generating video clips",
    scenes
  });

  for (const [index, scene] of scenes.entries()) {
    await throwIfJobCancelled(jobId);
    const requestedDurationSeconds = scene.durationSeconds;
    const clipPath =
      scene.clipPath || path.join(directories.clipsDirectory, `scene-${scene.sceneIndex}.mp4`);

    await updatePipelineProgress(jobId, {
      status: "generating_video_clips",
      scenes,
      totalScenes: scenes.length,
      completedScenes: index,
      currentStep: `Generating clip ${index + 1} of ${scenes.length}`
    });
    logPipelineEvent(
      jobId,
      `Generating clip ${index + 1}/${scenes.length} for scene ${scene.sceneIndex} (${requestedDurationSeconds}s requested).`
    );

    if (scene.clipPath && (await pathExists(scene.clipPath))) {
      logPipelineEvent(
        jobId,
        `Reusing existing clip ${index + 1}/${scenes.length} for scene ${scene.sceneIndex}.`
      );
      await updatePipelineProgress(jobId, {
        scenes,
        totalScenes: scenes.length,
        completedScenes: index + 1,
        currentStep: `Reused clip ${index + 1} of ${scenes.length}`
      });
      continue;
    }

    const clipResult = await generateSceneClip({
      prompt: scene.videoPrompt,
      durationSeconds: requestedDurationSeconds,
      outputPath: clipPath,
      negativePrompt: generationControls.negativePrompt,
      cfgScale: generationControls.cfgScale,
      startImagePath: generationControls.startImagePath,
      maxRetries: 2,
      shouldCancel: () => isVideoJobCancelled(jobId)
    });

    await throwIfJobCancelled(jobId);
    scene.clipPath = clipPath;
    scene.durationSeconds = clipResult.durationSeconds;
    logPipelineEvent(
      jobId,
      `Finished clip ${index + 1}/${scenes.length} for scene ${scene.sceneIndex} (${clipResult.durationSeconds}s sent to model).`
    );
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

async function getOrCreateNarrationAudioPath(
  jobId: string,
  audioDirectory: string,
  plan: VideoPlan,
  existingNarrationAudioPath?: string
) {
  if (existingNarrationAudioPath && (await pathExists(existingNarrationAudioPath))) {
    logPipelineEvent(jobId, "Reusing existing narration audio.");
    await updatePipelineProgress(jobId, {
      status: "generating_narration",
      scenes: plan.scenes,
      totalScenes: plan.scenes.length,
      completedScenes: plan.scenes.length,
      narrationAudioPath: existingNarrationAudioPath,
      currentStep: "Reused narration"
    });
    return existingNarrationAudioPath;
  }

  return tracePipelineStep({
    jobId,
    stepName: "narration_generation",
    metadata: {
      sceneCount: plan.scenes.length
    },
    run: () => runNarrationStep(jobId, audioDirectory, plan),
    onSuccessMetadata: (result) => ({
      narrationAudioPath: result
    })
  });
}

async function getOrCreateSubtitlePath(
  jobId: string,
  subtitlesDirectory: string,
  plan: VideoPlan,
  narrationAudioPath: string,
  existingSubtitlePath?: string
) {
  if (existingSubtitlePath && (await pathExists(existingSubtitlePath))) {
    logPipelineEvent(jobId, "Reusing existing subtitles.");
    await updatePipelineProgress(jobId, {
      status: "generating_subtitles",
      subtitlePath: existingSubtitlePath,
      narrationAudioPath,
      totalScenes: plan.scenes.length,
      completedScenes: plan.scenes.length,
      currentStep: "Reused subtitles"
    });
    return existingSubtitlePath;
  }

  return tracePipelineStep({
    jobId,
    stepName: "subtitle_generation",
    metadata: {
      narrationAudioPath
    },
    run: () => runSubtitleStep(jobId, subtitlesDirectory, plan, narrationAudioPath),
    onSuccessMetadata: (result) => ({
      subtitlePath: result
    })
  });
}

async function getOrCreateOutputVideoPath(
  jobId: string,
  directories: ReturnType<typeof buildProjectPaths>,
  scenes: VideoScene[],
  narrationAudioPath: string,
  subtitlePath: string,
  existingOutputVideoPath?: string,
  videoResolution: VideoResolution = "720p"
) {
  if (existingOutputVideoPath && (await pathExists(existingOutputVideoPath))) {
    logPipelineEvent(jobId, "Reusing existing final video.");
    await updatePipelineProgress(jobId, {
      status: "rendering_video",
      subtitlePath,
      totalScenes: scenes.length,
      completedScenes: scenes.length,
      currentStep: "Reused final render"
    });
    return existingOutputVideoPath;
  }

  return tracePipelineStep({
    jobId,
    stepName: "ffmpeg_rendering",
    metadata: {
      sceneCount: scenes.length,
      subtitlePath
    },
    run: () =>
      runRenderStep(
        jobId,
        directories,
        scenes,
        narrationAudioPath,
        subtitlePath,
        videoResolution
      ),
    onSuccessMetadata: (result) => ({
      outputVideoPath: result
    })
  });
}

async function runNarrationStep(
  jobId: string,
  audioDirectory: string,
  plan: VideoPlan
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting narration generation.");
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
  logPipelineEvent(jobId, "Finished narration generation.");

  return narrationAudioPath;
}

async function runSubtitleStep(
  jobId: string,
  subtitlesDirectory: string,
  plan: VideoPlan,
  narrationAudioPath: string
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting subtitle generation.");
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
  logPipelineEvent(jobId, `Finished subtitle generation with ${subtitleSegments.length} segments.`);

  return subtitlePath;
}

async function runMetadataStep(
  jobId: string,
  prompt: string,
  plan: VideoPlan
): Promise<VideoMetadata> {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting metadata generation.");
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
  logPipelineEvent(jobId, `Finished metadata generation with ${metadata.tags.length} tags.`);

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
  subtitlePath: string,
  videoResolution: VideoResolution
) {
  await throwIfJobCancelled(jobId);
  logPipelineEvent(jobId, "Starting final render.");
  await updatePipelineProgress(jobId, {
    status: "rendering_video",
    subtitlePath,
    totalScenes: scenes.length,
    completedScenes: scenes.length,
    currentStep: "Normalizing clips and rendering final video"
  });

  const renderedScenePaths: string[] = [];

  for (const scene of scenes) {
    await throwIfJobCancelled(jobId);
    const clipPath = path.join(directories.clipsDirectory, `scene-${scene.sceneIndex}.mp4`);
    const renderedScenePath = path.join(directories.renderDirectory, `scene-${scene.sceneIndex}.mp4`);

    logPipelineEvent(jobId, `Normalizing rendered scene ${scene.sceneIndex}.`);
    await renderSceneClip({
      clipPath,
      outputPath: renderedScenePath,
      videoResolution
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
  logPipelineEvent(jobId, "Concatenated scene clips.");

  const outputVideoPath = path.join(directories.rootDirectory, "final-video.mp4");
  await addNarrationTrack({
    videoPath: concatenatedVideoPath,
    narrationPath: narrationAudioPath,
    subtitlePath,
    outputPath: outputVideoPath
  });
  logPipelineEvent(jobId, "Finished final render.");

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
  }, {
    clearError: true
  });
}
