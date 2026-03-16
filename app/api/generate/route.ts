import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildProjectPaths } from "@/lib/server/filesystem";
import { createVideoJob } from "@/lib/server/jobs";
import { enqueueVideoJob } from "@/lib/server/queue";

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

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error."
      },
      { status: 500 }
    );
  }
}
