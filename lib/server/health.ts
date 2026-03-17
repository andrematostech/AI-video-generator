import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadServerEnv } from "@/lib/config/env";

type HealthCheckStatus = "ok" | "error" | "warning";

type HealthCheckResult = {
  status: HealthCheckStatus;
  details?: Record<string, unknown>;
  error?: string;
};

export type SystemHealthReport = {
  status: "ok" | "degraded";
  timestamp: string;
  checks: {
    server: HealthCheckResult;
    environment: HealthCheckResult;
    ffmpeg: HealthCheckResult;
    assetsDirectory: HealthCheckResult;
    providers: HealthCheckResult;
  };
};

function buildErrorResult(error: unknown): HealthCheckResult {
  return {
    status: "error",
    error: error instanceof Error ? error.message : "Unknown health check error."
  };
}

async function checkFfmpeg(ffmpegPath: string): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const processHandle = spawn(ffmpegPath, ["-version"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    processHandle.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processHandle.on("error", (error) => {
      resolve(buildErrorResult(error));
    });

    processHandle.on("close", (code) => {
      if (code !== 0) {
        resolve(
          buildErrorResult(
            new Error(stderr.trim() || `FFmpeg exited with code ${code}.`)
          )
        );
        return;
      }

      const firstLine = stdout.split(/\r?\n/)[0]?.trim() ?? "FFmpeg available";
      resolve({
        status: "ok",
        details: {
          path: ffmpegPath,
          version: firstLine
        }
      });
    });
  });
}

async function checkAssetsDirectory(assetsDirectory: string): Promise<HealthCheckResult> {
  const probeDirectory = path.join(assetsDirectory, ".healthcheck");
  const probeFilePath = path.join(probeDirectory, "write-test.tmp");

  try {
    await mkdir(probeDirectory, { recursive: true });
    await writeFile(probeFilePath, "ok", "utf8");
    await unlink(probeFilePath);

    return {
      status: "ok",
      details: {
        path: assetsDirectory,
        writable: true
      }
    };
  } catch (error) {
    return buildErrorResult(error);
  }
}

export async function getSystemHealthReport(): Promise<SystemHealthReport> {
  const timestamp = new Date().toISOString();
  const serverCheck: HealthCheckResult = {
    status: "ok",
    details: {
      runtime: "nextjs-api-route"
    }
  };

  try {
    const env = loadServerEnv();
    const [ffmpegCheck, assetsDirectoryCheck] = await Promise.all([
      checkFfmpeg(env.FFMPEG_PATH),
      checkAssetsDirectory(env.ASSETS_DIR)
    ]);

    const providersCheck: HealthCheckResult = {
      status:
        env.OPENAI_API_KEY && env.REPLICATE_API_TOKEN ? "ok" : "warning",
      details: {
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        replicateConfigured: Boolean(env.REPLICATE_API_TOKEN),
        openAiModel: env.OPENAI_MODEL,
        openAiTtsModel: env.OPENAI_TTS_MODEL,
        replicateModel: env.REPLICATE_MODEL
      }
    };

    const checks = {
      server: serverCheck,
      environment: {
        status: "ok" as const,
        details: {
          appUrl: env.APP_URL,
          assetsDir: env.ASSETS_DIR,
          ffmpegPath: env.FFMPEG_PATH
        }
      },
      ffmpeg: ffmpegCheck,
      assetsDirectory: assetsDirectoryCheck,
      providers: providersCheck
    };

    const hasRequiredFailure =
      checks.ffmpeg.status === "error" ||
      checks.assetsDirectory.status === "error";

    return {
      status: hasRequiredFailure ? "degraded" : "ok",
      timestamp,
      checks
    };
  } catch (error) {
    return {
      status: "degraded",
      timestamp,
      checks: {
        server: serverCheck,
        environment: buildErrorResult(error),
        ffmpeg: {
          status: "warning",
          details: {
            skipped: true
          }
        },
        assetsDirectory: {
          status: "warning",
          details: {
            skipped: true
          }
        },
        providers: {
          status: "warning",
          details: {
            skipped: true
          }
        }
      }
    };
  }
}
