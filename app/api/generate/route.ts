import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildProjectPaths } from "@/lib/server/filesystem";
import { createVideoJob } from "@/lib/server/jobs";
import { enqueueVideoJob } from "@/lib/server/queue";
import {
  consumeGenerateRateLimit,
  getRateLimitKeyFromRequestHeaders
} from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

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

    const job = await createVideoJob({
      id: jobId,
      prompt,
      assetsDirectory: directories.rootDirectory,
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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error."
      },
      { status: 500 }
    );
  }
}
