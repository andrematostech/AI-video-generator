import path from "node:path";
import { randomUUID } from "node:crypto";
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
  generateVideoPlan
} from "@/lib/providers/openai";
import { generateNarrationAudio } from "@/lib/providers/openai-tts";
import { transcribeNarration } from "@/lib/providers/openai-transcription";
import { generateSceneClip } from "@/lib/providers/replicate";
import { buildSrt } from "@/lib/server/subtitles";
import { GeneratedScript, VideoJobResult, VideoPlan, VideoScene } from "@/lib/types";
import { createVideoJob, markVideoJobFailed, updateVideoJob } from "@/lib/server/jobs";

export async function runVideoPipeline(prompt: string) {
  const projectId = randomUUID();
  const directories = buildProjectPaths(projectId);

  await createVideoJob({
    id: projectId,
    prompt,
    assetsDirectory: directories.rootDirectory
  });

  try {
    await ensureDirectories([
      directories.rootDirectory,
      directories.clipsDirectory,
      directories.audioDirectory,
      directories.subtitlesDirectory,
      directories.renderDirectory
    ]);

    const generatedScript = await runScriptStep(projectId, prompt);
    const plan = await runSceneStep(projectId, prompt, generatedScript);
    await runClipStep(projectId, directories, plan.scenes);
    const narrationAudioPath = await runNarrationStep(projectId, directories.audioDirectory, plan);
    const subtitlePath = await runSubtitleStep(projectId, directories.subtitlesDirectory, plan, narrationAudioPath);
    const outputVideoPath = await runRenderStep(
      projectId,
      directories,
      plan.scenes,
      narrationAudioPath,
      subtitlePath
    );

    const result: VideoJobResult = {
      ...(await updateVideoJob(projectId, {
        status: "completed",
        title: plan.title,
        narrationAudioPath,
        subtitlePath,
        outputVideoPath,
        script: plan.script,
        targetDurationSeconds: plan.targetDurationSeconds,
        scenes: plan.scenes,
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
    const message =
      error instanceof Error ? error.message : "Unexpected error during video generation.";

    await markVideoJobFailed(projectId, message);
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

    await generateSceneClip({
      prompt: scene.videoPrompt,
      durationSeconds: scene.durationSeconds,
      outputPath: clipPath,
      maxRetries: 2
    });

    scene.clipPath = clipPath;

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
