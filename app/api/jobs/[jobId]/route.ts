import { NextResponse } from "next/server";
import { readVideoJob, updateVideoJob } from "@/lib/server/jobs";
import { enqueueVideoJob, removePendingVideoJobs } from "@/lib/server/queue";
import { VideoScene } from "@/lib/types";

type RouteContext = {
  params: {
    jobId: string;
  };
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const result = await readVideoJob(context.params.jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Job not found."
      },
      { status: 404 }
    );
  }
}

function normalizeScenes(input: unknown): VideoScene[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 6) {
    throw new Error("Scenes must contain between 1 and 6 items.");
  }

  return input.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error(`Scene ${index + 1} is invalid.`);
    }

    const candidate = scene as Partial<VideoScene>;
    const narration = String(candidate.narration ?? "").trim();
    const videoPrompt = String(candidate.videoPrompt ?? "").trim();
    const durationSeconds = Number(candidate.durationSeconds);

    if (!narration) {
      throw new Error(`Scene ${index + 1} narration is required.`);
    }

    if (!videoPrompt) {
      throw new Error(`Scene ${index + 1} video prompt is required.`);
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Scene ${index + 1} duration must be greater than 0.`);
    }

    return {
      sceneIndex: index + 1,
      narration,
      videoPrompt,
      durationSeconds,
      clipPath: undefined
    };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const job = await readVideoJob(context.params.jobId);
    const body = (await request.json()) as {
      action?: "save" | "confirm" | "cancel";
      scenes?: unknown;
    };

    if (body.action === "cancel") {
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return NextResponse.json(
          {
            error: "This job can no longer be cancelled from the UI."
          },
          { status: 409 }
        );
      }

      await removePendingVideoJobs(job.id);

      const updatedJob = await updateVideoJob(job.id, {
        status: "cancelled",
        error: "Cancelled by user.",
        progress: {
          completedScenes: job.progress.completedScenes,
          totalScenes: job.progress.totalScenes,
          currentStep: "Cancelled by user"
        }
      });

      return NextResponse.json(updatedJob);
    }

    if (job.status !== "awaiting_scene_approval") {
      return NextResponse.json(
        {
          error: "Scenes can only be updated while awaiting approval."
        },
        { status: 409 }
      );
    }

    const scenes = normalizeScenes(body.scenes);
    const action = body.action ?? "save";

    if (action === "confirm") {
      const updatedJob = await updateVideoJob(job.id, {
        status: "queued",
        scenes,
        progress: {
          completedScenes: 0,
          totalScenes: scenes.length,
          currentStep: "Queued after scene approval"
        }
      }, {
        clearError: true
      });

      await enqueueVideoJob({
        jobId: job.id,
        prompt: job.prompt,
        attempt: 1,
        maxAttempts: job.maxAttempts,
        enqueuedAt: new Date().toISOString()
      });

      return NextResponse.json(updatedJob);
    }

    const updatedJob = await updateVideoJob(job.id, {
      scenes,
      progress: {
        completedScenes: 0,
        totalScenes: scenes.length,
        currentStep: "Review scenes and confirm before video generation"
      }
    });

    return NextResponse.json(updatedJob);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update scenes."
      },
      { status: 400 }
    );
  }
}
