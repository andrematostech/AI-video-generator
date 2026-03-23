import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildProjectPaths, ensureDirectories, writeBuffer } from "@/lib/server/filesystem";
import { createVideoJob } from "@/lib/server/jobs";
import { enqueueVideoJob } from "@/lib/server/queue";
import { VideoGenerationControls, VideoResolution, VideoStyleMode } from "@/lib/types";
import {
  consumeGenerateRateLimit,
  getRateLimitKeyFromRequestHeaders
} from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let prompt: string | undefined;
    let videoResolution: VideoResolution = "720p";
    let videoStyleMode: VideoStyleMode = "realistic";
    let generationControls: VideoGenerationControls = {
      cfgScale: 0.5
    };
    let uploadedStartImage: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      prompt = String(formData.get("prompt") ?? "").trim();
      videoResolution = formData.get("videoResolution") === "1080p" ? "1080p" : "720p";
      videoStyleMode = formData.get("videoStyleMode") === "stylized" ? "stylized" : "realistic";
      const negativePromptValue = String(formData.get("negativePrompt") ?? "").trim();
      const cfgScaleValue = Number(formData.get("cfgScale") ?? 0.5);
      const startImageValue = formData.get("startImage");

      generationControls = {
        negativePrompt: negativePromptValue || undefined,
        cfgScale:
          Number.isFinite(cfgScaleValue) && cfgScaleValue >= 0 && cfgScaleValue <= 1
            ? cfgScaleValue
            : 0.5
      };

      uploadedStartImage = startImageValue instanceof File && startImageValue.size > 0
        ? startImageValue
        : null;
    } else {
      const body = (await request.json()) as {
        prompt?: string;
        videoResolution?: VideoResolution;
        videoStyleMode?: VideoStyleMode;
        negativePrompt?: string;
        cfgScale?: number;
      };
      prompt = body.prompt?.trim();
      videoResolution = body.videoResolution === "1080p" ? "1080p" : "720p";
      videoStyleMode = body.videoStyleMode === "stylized" ? "stylized" : "realistic";
      generationControls = {
        negativePrompt: body.negativePrompt?.trim() || undefined,
        cfgScale:
          typeof body.cfgScale === "number" &&
          Number.isFinite(body.cfgScale) &&
          body.cfgScale >= 0 &&
          body.cfgScale <= 1
            ? body.cfgScale
            : 0.5
      };
    }

    if (!prompt) {
      return NextResponse.json(
        {
          error: "Prompt is required."
        },
        { status: 400 }
      );
    }

    const rateLimit = await consumeGenerateRateLimit(
      getRateLimitKeyFromRequestHeaders(request.headers)
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before creating another job.`,
          retryAfterSeconds: rateLimit.retryAfterSeconds
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining)
          }
        }
      );
    }

    const jobId = randomUUID();
    const directories = buildProjectPaths(jobId);
    const maxAttempts = 3;

    if (uploadedStartImage) {
      const extension = path.extname(uploadedStartImage.name || "").toLowerCase() || ".png";
      const safeExtension = /^[.][a-z0-9]+$/.test(extension) ? extension : ".png";
      const startImagePath = path.join(directories.inputsDirectory, `start-image${safeExtension}`);
      await ensureDirectories([directories.rootDirectory, directories.inputsDirectory]);
      await writeBuffer(startImagePath, await uploadedStartImage.arrayBuffer());
      generationControls.startImagePath = startImagePath;
    }

    const job = await createVideoJob({
      id: jobId,
      prompt,
      assetsDirectory: directories.rootDirectory,
      videoResolution,
      videoStyleMode,
      generationControls,
      maxAttempts
    });

    await enqueueVideoJob({
      jobId,
      prompt,
      attempt: 1,
      maxAttempts,
      enqueuedAt: new Date().toISOString()
    });

    return NextResponse.json(job, {
      status: 202,
      headers: {
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining)
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        error: message,
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? {
              stack: error.stack
            }
          : {})
      },
      { status: 500 }
    );
  }
}
