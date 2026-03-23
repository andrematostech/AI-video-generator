import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env.server";

export function buildProjectPaths(projectId: string) {
  const env = getServerEnv();
  const rootDirectory = path.join(env.ASSETS_DIR, projectId);
  const clipsDirectory = path.join(rootDirectory, "clips");
  const audioDirectory = path.join(rootDirectory, "audio");
  const subtitlesDirectory = path.join(rootDirectory, "subtitles");
  const renderDirectory = path.join(rootDirectory, "render");
  const inputsDirectory = path.join(rootDirectory, "inputs");

  return {
    rootDirectory,
    clipsDirectory,
    audioDirectory,
    subtitlesDirectory,
    renderDirectory,
    inputsDirectory
  };
}

export async function ensureDirectories(paths: string[]) {
  await Promise.all(paths.map((directoryPath) => mkdir(directoryPath, { recursive: true })));
}

export async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function downloadFile(fileUrl: string, targetPath: string) {
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to download file from ${fileUrl}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, bytes);
}

export async function writeBuffer(targetPath: string, buffer: ArrayBuffer) {
  await writeFile(targetPath, Buffer.from(buffer));
}

export async function writeText(targetPath: string, content: string) {
  await writeFile(targetPath, content, "utf8");
}

export async function writeJson(targetPath: string, value: unknown) {
  await writeFile(targetPath, JSON.stringify(value, null, 2), "utf8");
}

export async function readJson<T>(targetPath: string) {
  const content = await readFile(targetPath, "utf8");
  return JSON.parse(content) as T;
}
