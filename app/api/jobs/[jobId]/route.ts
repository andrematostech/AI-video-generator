import { NextResponse } from "next/server";
import { readVideoJob } from "@/lib/server/jobs";

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
