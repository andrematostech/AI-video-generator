import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env.server";
import { VideoResolution } from "@/lib/types";

const TARGET_FPS = 30;

function getResolutionDimensions(videoResolution: VideoResolution = "720p") {
  if (videoResolution === "1080p") {
    return {
      width: 1920,
      height: 1080
    };
  }

  return {
    width: 1280,
    height: 720
  };
}

function runFfmpeg(args: string[]) {
  const env = getServerEnv();

  return new Promise<void>((resolve, reject) => {
    const processHandle = spawn(env.FFMPEG_PATH, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
    });
  });
}

export function buildRenderSceneClipArgs(options: {
  clipPath: string;
  outputPath: string;
  videoResolution?: VideoResolution;
}) {
  const target = getResolutionDimensions(options.videoResolution);

  return [
    "-y",
    "-i",
    options.clipPath,
    "-vf",
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${TARGET_FPS},format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-an",
    options.outputPath
  ];
}

export async function renderSceneClip(options: {
  clipPath: string;
  outputPath: string;
  videoResolution?: VideoResolution;
}) {
  await runFfmpeg(buildRenderSceneClipArgs(options));
}

export function buildConcatListContent(scenePaths: string[]) {
  return scenePaths
    .map((scenePath) => `file '${scenePath.replace(/'/g, "'\\''")}'`)
    .join("\n");
}

export async function concatenateScenes(scenePaths: string[], outputPath: string) {
  const listFilePath = path.join(path.dirname(outputPath), "concat.txt");
  const listContent = buildConcatListContent(scenePaths);

  await writeFile(listFilePath, listContent, "utf8");

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFilePath,
    "-c",
    "copy",
    outputPath
  ]);
}

export function buildAddNarrationTrackArgs(options: {
  videoPath: string;
  narrationPath: string;
  subtitlePath?: string;
  outputPath: string;
}) {
  const subtitleFilterPath = options.subtitlePath
    ? options.subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")
    : null;

  return [
    "-y",
    "-i",
    options.videoPath,
    "-i",
    options.narrationPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    ...(subtitleFilterPath
      ? [
          "-vf",
          `subtitles='${subtitleFilterPath}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&Hffffff&,OutlineColour=&H40000000&,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=24'`
        ]
      : []),
    "-c:v",
    subtitleFilterPath ? "libx264" : "copy",
    ...(subtitleFilterPath
      ? [
          "-preset",
          "medium",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p"
        ]
      : []),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    options.outputPath
  ];
}

export async function addNarrationTrack(options: {
  videoPath: string;
  narrationPath: string;
  subtitlePath?: string;
  outputPath: string;
}) {
  await runFfmpeg(buildAddNarrationTrackArgs(options));
}
